import type { BaseChatModel } from "../chat_models/base";
import type { BaseMemory } from "../memory/base";
import type { ChainValues, Message, ToolChoice, ToolCallOptions } from "../schema/types";
import type { BaseTool } from "../tools/base";

export interface ToolCallingAgentConfig {
  memory?: BaseMemory;
  systemPrompt?: string;
  toolChoice?: ToolChoice;
}

/**
 * ToolCallingAgent — provider-native tool-calling agent configuration.
 *
 * Unlike ReActAgent, this agent relies on the chat model's native tool-calling
 * interface instead of parsing tool actions from free-form text.
 */
export class ToolCallingAgent {
  readonly agentType = "tool-calling";

  private memory?: BaseMemory;
  private systemPrompt?: string;
  private toolChoice: ToolChoice;

  constructor(
    private llm: BaseChatModel,
    private tools: BaseTool[],
    config: ToolCallingAgentConfig = {}
  ) {
    this.memory = config.memory;
    this.systemPrompt = config.systemPrompt;
    this.toolChoice = config.toolChoice ?? "auto";
  }

  get allowedTools(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  get model(): BaseChatModel {
    return this.llm;
  }

  getTools(): BaseTool[] {
    return [...this.tools];
  }

  async buildInitialMessages(inputs: ChainValues): Promise<Message[]> {
    const messages: Message[] = [];

    if (this.systemPrompt) {
      messages.push({ role: "system", content: this.systemPrompt });
    }

    if (this.memory) {
      const memoryVars = await this.memory.loadMemoryVariables(inputs);
      const historyKey = Object.keys(memoryVars)[0];
      const history = historyKey ? memoryVars[historyKey] : undefined;

      if (Array.isArray(history)) {
        messages.push(...(history as Message[]));
      } else if (typeof history === "string" && history.trim()) {
        messages.push({ role: "system", content: `Conversation history:\n${history}` });
      }
    }

    const input =
      typeof inputs["input"] === "string"
        ? inputs["input"]
        : typeof inputs["question"] === "string"
        ? inputs["question"]
        : String(Object.values(inputs)[0] ?? "");

    messages.push({ role: "human", content: input });
    return messages;
  }

  async next(messages: Message[], options: ToolCallOptions = {}): Promise<Message> {
    if (this.tools.length === 0) {
      return this.llm.call(messages, options);
    }

    return this.llm.callWithTools(
      messages,
      this.tools.map((tool) => tool.toSchema()),
      {
        ...options,
        toolChoice: options.toolChoice ?? this.toolChoice
      }
    );
  }

  async saveContext(inputs: ChainValues, output: string): Promise<void> {
    if (!this.memory) return;
    await this.memory.saveContext(inputs, { output });
  }
}
