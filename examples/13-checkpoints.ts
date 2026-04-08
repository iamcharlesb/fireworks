import {
  DynamicTool,
  InMemoryCheckpointStore,
  ToolCallingAgent,
  ToolCallingAgentExecutor,
  BaseChatModel
} from "../src";
import type {
  FunctionDefinition,
  LLMResult,
  Message,
  RunOptions,
  ToolCallOptions
} from "../src";

class DemoCheckpointModel extends BaseChatModel {
  modelName = "demo-checkpoint-model";
  private failedOnce = false;

  _modelType(): string {
    return "demo-checkpoint-model";
  }

  async generate(_messages: Message[][], _options?: RunOptions): Promise<LLMResult> {
    throw new Error("Not used in this example");
  }

  async callWithTools(
    messages: Message[],
    _tools: FunctionDefinition[],
    _options?: ToolCallOptions
  ): Promise<Message> {
    const toolMessages = messages.filter((message) => message.role === "tool");

    if (toolMessages.length === 0) {
      return {
        role: "ai",
        content: "",
        toolCalls: [
          {
            id: "tool_uppercase",
            name: "uppercase",
            arguments: JSON.stringify({ input: "checkpoint me" })
          }
        ]
      };
    }

    if (!this.failedOnce) {
      this.failedOnce = true;
      throw new Error("Simulated interruption after tool execution");
    }

    return {
      role: "ai",
      content: `Recovered answer: ${toolMessages.map((message) => message.content).join(", ")}`
    };
  }
}

async function main(): Promise<void> {
  const checkpointStore = new InMemoryCheckpointStore();
  const uppercase = new DynamicTool({
    name: "uppercase",
    description: "Uppercase the provided text",
    func: async (input) => ({ output: input.toUpperCase() })
  });

  const agent = new ToolCallingAgent(new DemoCheckpointModel(), [uppercase]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore,
    threadId: "demo-thread",
    returnIntermediateSteps: true
  });

  try {
    await executor.call({ input: "Make this durable" });
  } catch (error) {
    console.log("Interrupted run:", error instanceof Error ? error.message : String(error));
  }

  const interrupted = await checkpointStore.getLatest("demo-thread");
  console.log("Interrupted checkpoint:", interrupted);

  const resumed = await executor.resume("demo-thread");
  console.log("Resumed output:", resumed.output);
  console.log("Resume metadata:", {
    checkpointId: resumed.checkpointId,
    threadId: resumed.threadId,
    steps: resumed.intermediateSteps
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
