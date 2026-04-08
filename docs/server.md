# Management Server

Fireworks++ ships with a local management server for dashboards, alerts, and operational API access.

## Start Programmatically

```typescript
import { HS256Authenticator, ManagementServer } from 'fireworks-plus-plus'

const server = new ManagementServer({
  auditPath: '.fireworks-plus-plus/audit.log',
  checkpointDir: '.fireworks-plus-plus/checkpoints',
  workflowDir: '.fireworks-plus-plus/workflows',
  authenticator: new HS256Authenticator({
    secret: process.env.AGENTFIREWORKS_AUTH_SECRET!,
    issuer: 'fireworks-plus-plus',
    audience: 'dashboard'
  })
})

const details = await server.start()
console.log(details.url)
```

## Endpoints

- `GET /health`
- `GET /dashboard`
- `GET /api/dashboard`
- `GET /api/alerts`
- `GET /api/audit`
- `GET /api/checkpoints`
- `GET /api/workflows`

## CLI

```bash
fireworks-plus-plus serve --host 127.0.0.1 --port 3000
```

## Notes

- This is a local/self-hosted management surface.
- It is intended for on-prem and private-network deployments.
- It is not a multi-tenant SaaS control plane.
