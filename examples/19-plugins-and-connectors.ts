import {
  ConnectorDispatcher,
  DynamicTool,
  PluginRegistry,
  type ConnectorPayload,
  type IntegrationConnector
} from "../src";

class ConsoleConnector implements IntegrationConnector {
  async send(payload: ConnectorPayload): Promise<void> {
    console.log("Connector payload:", payload.kind);
  }
}

async function main(): Promise<void> {
  const registry = new PluginRegistry();
  registry.registerManifest({
    name: "demo-pack",
    tools: [
      {
        kind: "tool",
        name: "echo",
        create() {
          return new DynamicTool({
            name: "echo",
            description: "Echo input",
            func: async (input) => ({ output: input })
          });
        }
      }
    ]
  });

  const tool = registry.createTool("echo");
  const dispatcher = new ConnectorDispatcher({
    connectors: [new ConsoleConnector()]
  });

  const output = await tool.run("hello");
  await dispatcher.dispatch({
    kind: "snapshot",
    snapshot: {
      plugins: registry.list(),
      toolOutput: output
    }
  });

  console.log("Registered plugins:", registry.list());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
