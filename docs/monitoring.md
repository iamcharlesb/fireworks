# Monitoring

Fireworks++ now ships with a local monitoring layer for generating runtime snapshots, evaluating alerts, and rendering static dashboards from audit/checkpoint data.

## Snapshot Loading

Use `loadMonitoringSnapshot()` to summarize local runtime artifacts.

```typescript
import { loadMonitoringSnapshot } from 'fireworks-plus-plus'

const snapshot = await loadMonitoringSnapshot({
  auditPath: '.fireworks-plus-plus/audit.log',
  checkpointDir: '.fireworks-plus-plus/checkpoints',
  workflowDir: '.fireworks-plus-plus/workflows'
})
```

The snapshot includes:

- audit totals and status/type breakdowns
- checkpoint totals and pending approvals
- workflow totals and pending parallel branches
- recent audit events, checkpoints, and workflow runs

## Alerts

`AlertManager` evaluates a monitoring snapshot against built-in runtime health rules.

```typescript
import { AlertManager } from 'fireworks-plus-plus'

const alerts = await new AlertManager().evaluate(snapshot)
```

Built-in rules cover:

- audit warnings/errors
- pending approval backlogs
- stale approval checkpoints
- paused workflows
- budget denial events

You can also pass custom rules:

```typescript
const alerts = await new AlertManager({
  rules: [
    {
      id: 'require-audit-events',
      evaluate(snapshot) {
        if (snapshot.auditSummary.totalEvents > 0) return undefined
        return {
          id: 'missing-audit',
          severity: 'warning',
          title: 'No audit activity',
          message: 'No audit events were found.',
          source: 'monitoring'
        }
      }
    }
  ]
}).evaluate(snapshot)
```

## Static Dashboards

`renderMonitoringDashboardHtml()` turns a snapshot and alert list into a standalone HTML dashboard.

```typescript
import { renderMonitoringDashboardHtml } from 'fireworks-plus-plus'
import { writeFile } from 'node:fs/promises'

const html = renderMonitoringDashboardHtml(snapshot, alerts)
await writeFile('.fireworks-plus-plus/dashboard.html', html, 'utf8')
```

## CLI

The CLI exposes the same functionality directly:

```bash
fireworks-plus-plus dashboard
fireworks-plus-plus dashboard --json
fireworks-plus-plus dashboard --html .fireworks-plus-plus/dashboard.html
fireworks-plus-plus alerts
fireworks-plus-plus alerts --json
```

## Scope

This is an OSS operations surface for local deployments and CI artifacts. It is not a hosted multi-tenant dashboard or SaaS control plane.
