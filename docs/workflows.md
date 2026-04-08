# Workflows

Workflows add graph-based orchestration on top of Fireworks++. They let you define named nodes, connect them with conditional edges, pause execution, resume from checkpoints, and preserve branching state across runs.

---

## Core Pieces

```typescript
import {
  WorkflowGraph,
  WorkflowExecutor,
  InMemoryWorkflowCheckpointStore,
  FileWorkflowCheckpointStore
} from 'fireworks-plus-plus'
```

- `WorkflowGraph` defines nodes and edges
- `WorkflowExecutor` runs the graph and persists state
- `InMemoryWorkflowCheckpointStore` is useful for tests and short-lived processes
- `FileWorkflowCheckpointStore` provides simple on-disk durability

---

## Build a Workflow Graph

```typescript
import { WorkflowGraph } from 'fireworks-plus-plus'

const graph = new WorkflowGraph('support_triage')

graph
  .addNode(
    'triage',
    (state) => ({
      state: {
        route: String(state.input).includes('urgent') ? 'urgent' : 'standard'
      }
    }),
    { start: true }
  )
  .addConditionalEdges('triage', [
    {
      to: 'urgent_reply',
      label: 'urgent',
      condition: (state) => state.route === 'urgent'
    },
    {
      to: 'standard_reply',
      label: 'standard',
      condition: (state) => state.route === 'standard'
    }
  ])
  .addNode('urgent_reply', () => ({ state: { reply: 'Escalated immediately.' } }))
  .addEdge('urgent_reply', 'done')
  .addNode('standard_reply', () => ({ state: { reply: 'Handled normally.' } }))
  .addEdge('standard_reply', 'done')
  .addNode(
    'done',
    (state) => ({
      output: {
        message: state.reply,
        route: state.route
      }
    }),
    { terminal: true }
  )
```

---

## Execute a Workflow

```typescript
import {
  InMemoryWorkflowCheckpointStore,
  WorkflowExecutor
} from 'fireworks-plus-plus'

const executor = new WorkflowExecutor(graph, {
  checkpointStore: new InMemoryWorkflowCheckpointStore(),
  threadId: 'support-thread'
})

const result = await executor.run({
  input: 'urgent billing issue'
})

console.log(result.status)   // "completed"
console.log(result.output)   // { message: "Escalated immediately.", route: "urgent" }
console.log(result.history)  // includes branch information from triage
```

Executor results include:

- `status`
- `state`
- `output`
- `history`
- `currentNodeId`
- `checkpointId`
- `threadId`
- `runId`

---

## Pausing and Resuming

Nodes can pause execution and hand control back to the caller:

```typescript
graph
  .addNode(
    'review',
    (state) => {
      if (!state.reviewed) {
        return {
          pause: true,
          pauseReason: 'Awaiting reviewer input',
          next: 'finalize'
        }
      }

      return { next: 'finalize' }
    },
    { start: true }
  )
  .addNode(
    'finalize',
    (state) => ({
      output: {
        approved: Boolean(state.reviewed),
        reviewerNotes: state.reviewerNotes ?? null
      }
    }),
    { terminal: true }
  )

const paused = await executor.run({ input: 'Needs review' })
console.log(paused.status)      // "paused"
console.log(paused.pauseReason) // "Awaiting reviewer input"

const resumed = await executor.resume('support-thread', {
  reviewed: true,
  reviewerNotes: 'Approved by ops'
})
```

`resume()` merges the supplied state patch into the stored workflow state before continuing.

---

## Branching State

Branch decisions are stored in workflow history entries:

```typescript
const firstStep = result.history[0]
console.log(firstStep.nodeId)  // "triage"
console.log(firstStep.branch)  // "urgent"
console.log(firstStep.nextNodeId)
```

This gives you a durable trace of how the graph moved through conditional paths.

---

## Parallel Branches

Nodes can fan out into parallel branches and then merge the results back into workflow state.

```typescript
graph
  .addNode(
    'fanout',
    () => ({
      parallel: [
        { nodeId: 'profile', label: 'profile' },
        { nodeId: 'billing', label: 'billing' }
      ],
      mergeStrategy: 'namespaced',
      namespaceKey: 'branchResults',
      next: 'merge'
    }),
    { start: true }
  )
  .addNode(
    'profile',
    () => ({
      output: { name: 'Alice', plan: 'pro' }
    }),
    { terminal: true }
  )
  .addNode(
    'billing',
    () => ({
      output: { currency: 'USD', delinquent: false }
    }),
    { terminal: true }
  )
  .addNode(
    'merge',
    (state) => ({
      output: {
        profile: state.branchResults.profile,
        billing: state.branchResults.billing
      }
    }),
    { terminal: true }
  )
```

### Merge Strategies

- `namespaced`: stores branch results under `state[namespaceKey]` (default namespace: `parallel`)
- `shallow`: merges each branch output directly into the root workflow state

Parallel branch history entries include `parallelGroupId` and `branch`, so branch execution remains traceable after merge.

---

## Parallel Pause/Resume

If one parallel branch pauses while others finish, the workflow pauses with a persisted `pendingParallel` frame:

```typescript
const paused = await executor.run({ input: 'run parallel review' })

console.log(paused.status)          // "paused"
console.log(paused.pendingParallel) // branch states, labels, statuses

const resumed = await executor.resume('support-thread', {
  branchApproved: true
})
```

Completed branches are preserved; only the unfinished branches continue on resume before the merge step runs.

---

## Node Return Shapes

A node can return:

```typescript
{ state: { foo: 'bar' } }
{ state: { foo: 'bar' }, next: 'another_node' }
{ pause: true, pauseReason: 'Awaiting approval', next: 'resume_here' }
{ parallel: [{ nodeId: 'a' }, { nodeId: 'b' }], mergeStrategy: 'namespaced', next: 'merge' }
{ output: { result: 'done' } }
```

If a node returns a plain object without workflow control fields, it is treated as a state patch.

---

## Checkpoint Stores

```typescript
const memoryStore = new InMemoryWorkflowCheckpointStore()

const fileStore = new FileWorkflowCheckpointStore({
  directory: './.fireworks-plus-plus/workflows'
})
```

Both stores support:

```typescript
save(checkpoint)
get(checkpointId)
getLatest(threadId)
list(options?)
delete(checkpointId)
clear()
```

---

## Notes

- This is a graph runtime for deterministic orchestration and branching state.
- It is intentionally lighter than LangGraph-style distributed runtimes.
- It pairs well with the checkpointed `ToolCallingAgentExecutor` when you want a graph node to invoke an agent step.
- Nested parallel branches are not supported yet.
