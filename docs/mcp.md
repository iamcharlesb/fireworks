# MCP

Fireworks++ now supports both sides of MCP:

- MCP server support so Fireworks tools/resources/prompts can be exposed to MCP clients
- MCP client support so Fireworks agents can consume remote MCP tools

## Server

```typescript
import { DynamicTool, MCPServer } from 'fireworks-plus-plus'

const server = new MCPServer({
  tools: [
    new DynamicTool({
      name: 'echo',
      description: 'Echo input',
      func: async (input) => ({ output: `echo:${input}` })
    })
  ]
})
```

`MCPServer` supports:

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

## Client

```typescript
import { InMemoryMCPTransport, MCPClient } from 'fireworks-plus-plus'

const client = new MCPClient({
  transport: new InMemoryMCPTransport((message) => server.handleMessage(message))
})

await client.initialize()
const tools = await client.listTools()
const result = await client.callTool('echo', { input: 'hello' })
```

## Use MCP Tools in Agents

```typescript
const agent = createAgent({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY
})

await agent.useMCP(client)
const result = await agent.ask('Use the echo tool')
```

## Scope

This is a practical first-class MCP layer for tools, resources, and prompts. It is transport-agnostic in-process today and ready to be extended to stdio or HTTP transports if needed.
