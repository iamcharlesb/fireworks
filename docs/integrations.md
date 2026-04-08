# Integrations

Fireworks++ includes outbound connectors for pushing audit events and monitoring alerts into existing ops systems.

## Available Connectors

- `WebhookConnector`
- `RestConnector`
- `DatadogConnector`
- `SplunkHECConnector`
- `KafkaRestConnector`

## Dispatching Alerts

```typescript
import {
  AlertManager,
  ConnectorDispatcher,
  WebhookConnector,
  loadMonitoringSnapshot
} from 'fireworks-plus-plus'

const snapshot = await loadMonitoringSnapshot({
  auditPath: '.fireworks-plus-plus/audit.log',
  checkpointDir: '.fireworks-plus-plus/checkpoints',
  workflowDir: '.fireworks-plus-plus/workflows'
})
const alerts = await new AlertManager().evaluate(snapshot)

const dispatcher = new ConnectorDispatcher({
  connectors: [
    new WebhookConnector({ url: 'https://ops.example.com/agent-alerts' })
  ]
})

for (const alert of alerts) {
  await dispatcher.dispatchAlert(alert)
}
```

## Notes

- `DatadogConnector` writes Datadog event payloads.
- `SplunkHECConnector` writes Splunk HEC events.
- `KafkaRestConnector` targets Kafka REST Proxy style endpoints.
- These are transport connectors, not a full hosted event bus.
