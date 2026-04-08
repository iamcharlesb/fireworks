import {
  BaseChatModel,
  createAgent,
  DynamicTool,
  InMemoryMCPTransport,
  MCPClient,
  MCPServer
} from "../src";
import type { LLMResult, Message, RunOptions } from "../src";

class DemoMCPModel extends BaseChatModel {
  modelName = "demo-mcp-model";

  _modelType(): string {
    return "demo-mcp-model";
  }

  async generate(_messages: Message[][], _options?: RunOptions): Promise<LLMResult> {
    throw new Error("Not used");
  }

  async callWithTools(messages: Message[]) {
    const toolMessage = messages.find((message) => message.role === "tool");
    if (!toolMessage) {
      return {
        role: "ai" as const,
        content: "",
        toolCalls: [
          {
            id: "call_echo",
            name: "echo",
            arguments: JSON.stringify({ input: "world" })
          }
        ]
      };
    }

    return {
      role: "ai" as const,
      content: `Agent saw: ${toolMessage.content}`
    };
  }
}

async function main(): Promise<void> {
  const server = new MCPServer({
    tools: [
      new DynamicTool({
        name: "echo",
        description: "Echo input",
        func: async (input) => ({ output: `echo:${input}` })
      })
    ]
  });

  const client = new MCPClient({
    transport: new InMemoryMCPTransport((message) => server.handleMessage(message))
  });

  await client.initialize();
  const toolResult = await client.callTool("echo", { input: "hello" });
  console.log("Direct MCP call:", toolResult.content[0]);

  const agent = createAgent({
    chatModel: new DemoMCPModel()
  });

  await agent.useMCP(client);
  const result = await agent.ask("Use the MCP echo tool");
  console.log("Agent result:", result.text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
