# Checkpoints

Checkpoints persist agent runtime state so interrupted tool-calling runs can resume without starting over. This is the first durability layer in Fireworks++: the executor stores messages, pending tool calls, intermediate steps, and final outputs in a checkpoint store.

---

## Stores

Fireworks++ ships with two checkpoint stores:

- `InMemoryCheckpointStore` for tests, demos, and short-lived app processes
- `FileCheckpointStore` for simple on-disk durability

```typescript
import {
  InMemoryCheckpointStore,
  FileCheckpointStore
} from 'fireworks-plus-plus'

const memoryStore = new InMemoryCheckpointStore()
const fileStore = new FileCheckpointStore({
  directory: './.fireworks-plus-plus/checkpoints'
})
```

---

## Durable Tool-Calling Executor

Attach a checkpoint store to `ToolCallingAgentExecutor`:

```typescript
import {
  ChatOpenAI,
  DynamicTool,
  FileCheckpointStore,
  ToolCallingAgent,
  ToolCallingAgentExecutor
} from 'fireworks-plus-plus'

const checkpointStore = new FileCheckpointStore({
  directory: './.fireworks-plus-plus/checkpoints'
})

const weatherTool = new DynamicTool({
  name: 'get_weather',
  description: 'Get weather for a city',
  func: async (input) => ({ output: `Sunny in ${input}` })
})

const agent = new ToolCallingAgent(
  new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  [weatherTool]
)

const executor = new ToolCallingAgentExecutor(agent, {
  checkpointStore,
  threadId: 'support-thread-1',
  returnIntermediateSteps: true
})

const result = await executor.call({
  input: 'What is the weather in Tokyo?'
})

console.log(result.output)
console.log(result.checkpointId)
console.log(result.threadId)
```

When checkpointing is enabled, executor results also include:

- `checkpointId`
- `threadId`
- `runId`

---

## Resuming a Run

Resume by thread or by checkpoint id:

```typescript
const resumed = await executor.resume('support-thread-1')

const sameRun = await executor.resumeFromCheckpoint(
  String(resumed.checkpointId)
)
```

If the latest checkpoint is already completed, the executor returns the stored result immediately.

---

## Stored State

Each checkpoint stores:

- input values
- message history
- completed intermediate steps
- pending tool calls from the current assistant turn
- iteration counters
- status: `running`, `completed`, or `error`
- final output or error message

That pending-tool state is important: if execution stops between tool calls, resume can continue from the remaining tool calls instead of throwing away the whole turn.

---

## Human Approval Gates

`ToolCallingAgentExecutor` can pause before risky tool calls when `requireApproval` is set.

```typescript
const executor = new ToolCallingAgentExecutor(agent, {
  checkpointStore,
  threadId: 'ops-thread',
  requireApproval: ['ssh', 'editor']
})

const paused = await executor.call({ input: 'Edit the production config' })
console.log(paused.status) // "waiting_for_approval"
console.log(paused.approval)
```

### Approval Modes

```typescript
requireApproval: true
requireApproval: ['ssh', 'editor']
requireApproval: (action, checkpoint) => action.tool === 'ssh'
```

### Resolving Approval

```typescript
await executor.approve('ops-thread', {
  reviewer: 'alice',
  reason: 'Approved maintenance window'
})

await executor.reject('ops-thread', {
  reviewer: 'bob',
  reason: 'Too risky'
})

const resumed = await executor.resume('ops-thread')
```

If a tool call is rejected, the executor records that rejection as a tool observation and continues the agent loop from there.

---

## Workflow Events

Each checkpoint keeps a workflow event log so callers can inspect how execution progressed:

- `started`
- `resumed`
- `assistant`
- `approval_requested`
- `approval_resolved`
- `tool_result`
- `completed`
- `error`

These events are returned in executor results as `workflow`.

---

## Checkpoint Store API

```typescript
interface CheckpointStore {
  save(checkpoint: AgentCheckpoint): Promise<void>
  get(checkpointId: string): Promise<AgentCheckpoint | undefined>
  getLatest(threadId: string): Promise<AgentCheckpoint | undefined>
  list(options?: ListCheckpointsOptions): Promise<AgentCheckpoint[]>
  delete(checkpointId: string): Promise<void>
  clear(): Promise<void>
}
```

### Query Options

```typescript
interface ListCheckpointsOptions {
  threadId?: string
  status?: 'running' | 'completed' | 'error'
  limit?: number
}
```

---

## Notes

- `InMemoryCheckpointStore` is process-local and not durable across restarts.
- `FileCheckpointStore` is intentionally simple JSON persistence, not a distributed runtime store.
- This now covers checkpointed resume and approval-gated tool execution, but it still does not provide full workflow graphs or branching state.
