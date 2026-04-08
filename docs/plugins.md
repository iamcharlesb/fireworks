# Plugins

Fireworks++ now includes a plugin registry for tools, document loaders, workflow nodes, and callback handlers.

## Registry

```typescript
import { PluginRegistry } from 'fireworks-plus-plus'

const registry = new PluginRegistry()
```

## Register a Manifest

```typescript
registry.registerManifest({
  name: 'demo',
  tools: [
    {
      kind: 'tool',
      name: 'echo',
      create() {
        return new DynamicTool({
          name: 'echo',
          description: 'Echo input',
          func: async (input) => ({ output: input })
        })
      }
    }
  ]
})
```

## Supported Plugin Types

- `tool`
- `loader`
- `workflow_node`
- `callback`

## Typical Use

- internal tool packs
- shared workflow nodes across teams
- organization-specific callback handlers
- application-specific loader bundles
