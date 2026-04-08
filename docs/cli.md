# CLI

Fireworks++ ships with a local CLI for scaffolding new projects and inspecting runtime state.

```bash
fireworks-plus-plus --help
```

## Commands

### `init`

Create a starter project with a provider-specific agent template, budget-aware callbacks, and file-backed audit/checkpoint paths.

```bash
fireworks-plus-plus init ./my-agent --provider anthropic
fireworks-plus-plus init ./my-agent --provider openai
```

Generated files:

- `package.json`
- `tsconfig.json`
- `fireworks.config.json`
- `.env.example`
- `.gitignore`
- `src/agent.ts`

### `doctor`

Validate the local environment and show whether Fireworks++ runtime artifacts already exist.

```bash
fireworks-plus-plus doctor
```

Sample output:

```text
fireworks_plus_plus_version: 0.1.0
node_version: v22.12.0
cwd: /path/to/project
config_present: true
provider: anthropic
anthropic_key: true
openai_key: false
audit_log: true
checkpoint_dir: true
workflow_dir: false
```

### `inspect audit`

Summarize a JSONL audit log written by `FileAuditLogger`.

```bash
fireworks-plus-plus inspect audit .fireworks-plus-plus/audit.log
fireworks-plus-plus inspect audit .fireworks-plus-plus/audit.log --json
```

### `inspect checkpoints`

Summarize checkpoint files written by `FileCheckpointStore`.

```bash
fireworks-plus-plus inspect checkpoints .fireworks-plus-plus/checkpoints
fireworks-plus-plus inspect checkpoints .fireworks-plus-plus/checkpoints --json
```

### `inspect workflows`

Summarize workflow checkpoint files written by `FileWorkflowCheckpointStore`.

```bash
fireworks-plus-plus inspect workflows .fireworks-plus-plus/workflows
fireworks-plus-plus inspect workflows .fireworks-plus-plus/workflows --json
```

### `dashboard`

Build a monitoring snapshot from local artifacts and print it or render it as HTML.

```bash
fireworks-plus-plus dashboard
fireworks-plus-plus dashboard --json
fireworks-plus-plus dashboard --html .fireworks-plus-plus/dashboard.html
```

### `alerts`

Evaluate built-in alert rules against the current local snapshot.

```bash
fireworks-plus-plus alerts
fireworks-plus-plus alerts --json
```

### `serve`

Start the local management server.

```bash
fireworks-plus-plus serve --host 127.0.0.1 --port 3000
```

## Configuration

The CLI reads `fireworks.config.json` from the current working directory when paths are not supplied explicitly.

```json
{
  "provider": "anthropic",
  "auditPath": ".fireworks-plus-plus/audit.log",
  "checkpointDir": ".fireworks-plus-plus/checkpoints",
  "workflowDir": ".fireworks-plus-plus/workflows"
}
```

## Notes

- The CLI is local-first. It does not require a hosted control plane.
- `inspect` is designed for operational debugging and CI logs, not full dashboard replacement.
- `dashboard` generates a static HTML report; it does not start a server.
- `serve` starts a self-hosted HTTP dashboard/API process intended for local and on-prem deployments.
- `init` generates a pragmatic starter focused on tool-calling agents, tracing, and budget-aware execution.
