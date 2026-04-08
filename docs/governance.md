# Governance

Fireworks++ now includes a governance layer for access control, policy enforcement, budgets, and audit logging.

## Building Blocks

### RBAC

`RBACAuthorizer` checks whether an actor may perform an action against a runtime resource.

```typescript
import { RBACAuthorizer } from 'fireworks-plus-plus'

const authorizer = new RBACAuthorizer({
  roles: [
    {
      name: 'operator',
      permissions: [
        { resourceType: 'tool', resourceId: 'calculator', action: 'execute' },
        { resourceType: 'workflow_node', resourceId: '*', action: 'execute' }
      ]
    }
  ]
})
```

### Policies

`PolicyEngine` evaluates runtime rules after authorization. This is where you enforce organization-specific restrictions.

```typescript
import { PolicyEngine } from 'fireworks-plus-plus'

const policies = new PolicyEngine({
  rules: [
    {
      id: 'block-ssh',
      effect: 'deny',
      description: 'Interactive shell access is disabled in this environment.',
      evaluate(context) {
        return context.resourceType === 'tool' && context.resourceId === 'ssh'
      }
    }
  ]
})
```

### Budgets

`BudgetManager` tracks budgets for runs, tool calls, workflow steps, and token usage.

```typescript
import { BudgetManager } from 'fireworks-plus-plus'

const budgets = new BudgetManager({
  limits: [
    { name: 'agent_runs', max: 100 },
    { name: 'tool_calls', max: 500 },
    { name: 'workflow_steps', max: 1000 },
    { name: 'total_tokens', max: 250000 }
  ]
})
```

### Audit Logs

`InMemoryAuditLogger` is useful for tests and embedded dashboards. `FileAuditLogger` persists newline-delimited JSON for local operations and ingestion pipelines.

```typescript
import { FileAuditLogger } from 'fireworks-plus-plus'

const audit = new FileAuditLogger({
  filePath: '.fireworks-plus-plus/audit.log'
})
```

### Token Budget Callback

`GovernanceBudgetHandler` converts LLM usage metadata into budget consumption and optional audit events.

```typescript
import { GovernanceBudgetHandler } from 'fireworks-plus-plus'

const handler = new GovernanceBudgetHandler({
  budgetManager: budgets,
  auditLogger: audit
})
```

## Governing Tool-Calling Agents

`ToolCallingAgentExecutor` can now enforce governance at runtime.

```typescript
import {
  BudgetManager,
  InMemoryAuditLogger,
  PolicyEngine,
  RBACAuthorizer,
  ToolCallingAgentExecutor
} from 'fireworks-plus-plus'

const executor = new ToolCallingAgentExecutor(agent, {
  actor: { id: 'alice', roles: ['operator'] },
  authorizer,
  policyEngine: policies,
  budgetManager: budgets,
  auditLogger: audit
})
```

The executor now:

- records `agent.run.*` audit events
- checks authorization before tool execution
- evaluates policy rules before tool execution
- enforces `agent_runs` and `tool_calls` budgets
- records denial reasons directly in the agent trajectory

## Governing Workflows

`WorkflowExecutor` supports the same governance primitives.

```typescript
import { WorkflowExecutor } from 'fireworks-plus-plus'

const executor = new WorkflowExecutor(graph, {
  actor: { id: 'ops-bot', roles: ['operator'] },
  authorizer,
  policyEngine: policies,
  budgetManager: budgets,
  auditLogger: audit
})
```

The workflow executor now:

- enforces `workflow_steps` budgets
- checks authorization for each workflow node
- evaluates policy rules against node execution
- emits `workflow.*` audit events for starts, completions, pauses, and denials

## What This Is

- A runtime governance foundation for OSS deployments
- Local-first auditability and budget controls
- A clean hook point for future enterprise integrations

## What This Is Not Yet

- Full SSO/SAML integration
- Hosted multi-tenant management dashboards
- Fine-grained secret distribution or key brokering
- External policy backends such as OPA or Cedar
