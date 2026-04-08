# Simple API

Fireworks++ now has a high-level facade for the “easy to start, powerful underneath” experience.

## `createAgent()`

```typescript
import { createAgent } from 'fireworks-plus-plus'

const agent = createAgent({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  tools: {
    weather: async (input) => `Sunny in ${input}`
  }
})

const result = await agent.ask('Weather in Tokyo?')
console.log(result.text)
```

## Why Use It

- fewer concepts up front
- object-style tool registration
- built-in checkpoints and audit logging
- optional governance without dropping to low-level APIs
- direct path to dashboards, alerts, and the management server

## Methods

### `ask()`

```typescript
const result = await agent.ask('Deploy the latest release')
console.log(result.text)
console.log(result.status)
```

### `use()`

```typescript
agent.use('deploy', async (input) => `Deploying ${input}`)
```

You can also register a full `BaseTool`.

### `enableGovernance()`

```typescript
agent.enableGovernance({
  actor: { id: 'alice', roles: ['operator'] },
  roles: [
    {
      name: 'operator',
      permissions: [
        { resourceType: 'tool', resourceId: 'deploy', action: 'execute' }
      ]
    }
  ],
  requireApproval: ['deploy']
})
```

### `alerts()` and `dashboard()`

```typescript
const alerts = await agent.alerts()
const html = await agent.dashboard({ html: true })
```

### `createServer()`

```typescript
const server = agent.createServer()
const details = await server.start()
console.log(details.url)
```

### `toExecutor()`

If you need the advanced layer, you can drop down without rewriting your app:

```typescript
const executor = agent.toExecutor()
```

## Mental Model

- Start with `createAgent()`
- Stay there for most apps
- Drop to the advanced runtime only when you need finer control
