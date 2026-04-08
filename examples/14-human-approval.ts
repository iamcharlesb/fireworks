import {
  BaseChatModel,
  DynamicTool,
  InMemoryCheckpointStore,
  ToolCallingAgent,
  ToolCallingAgentExecutor
} from "../src";
import type {
  FunctionDefinition,
  LLMResult,
  Message,
  RunOptions,
  ToolCallOptions
} from "../src";

class ApprovalDemoModel extends BaseChatModel {
  modelName = "approval-demo-model";

  _modelType(): string {
    return "approval-demo-model";
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
            id: "tool_delete",
            name: "dangerous_action",
            arguments: JSON.stringify({ input: "delete tmp files" })
          }
        ]
      };
    }

    return {
      role: "ai",
      content: `Final answer after review: ${toolMessages[0].content}`
    };
  }
}

async function main(): Promise<void> {
  const checkpointStore = new InMemoryCheckpointStore();
  const dangerousAction = new DynamicTool({
    name: "dangerous_action",
    description: "A tool that should always require approval",
    func: async (input) => ({ output: `Executed: ${input}` })
  });

  const agent = new ToolCallingAgent(new ApprovalDemoModel(), [dangerousAction]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore,
    threadId: "approval-demo-thread",
    requireApproval: true,
    returnIntermediateSteps: true
  });

  const paused = await executor.call({ input: "Clean up temp files" });
  console.log("Paused state:", {
    status: paused.status,
    approval: paused.approval
  });

  await executor.reject("approval-demo-thread", {
    reviewer: "operator",
    reason: "Needs manual verification"
  });

  const resumed = await executor.resume("approval-demo-thread");
  console.log("Final result:", resumed.output);
  console.log("Workflow events:", resumed.workflow);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
