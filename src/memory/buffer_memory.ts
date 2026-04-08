import { BaseChatMemory } from "./base";
import type { ChainValues, Message } from "../schema/types";

export interface BufferMemoryConfig {
  humanPrefix?: string;
  aiPrefix?: string;
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
  returnMessages?: boolean;
}

/**
 * ConversationBufferMemory — stores the full conversation history in a buffer.
 * Simple and effective for shorter conversations.
 *
 * @example
 * const memory = new ConversationBufferMemory()
 * await memory.saveContext({ input: "Hi" }, { output: "Hello!" })
 * const vars = await memory.loadMemoryVariables()
 * // { history: "Human: Hi\nAI: Hello!" }
 */
export class ConversationBufferMemory extends BaseChatMemory {
  memoryKeys: string[];
  private humanPrefix: string;
  private aiPrefix: string;
  private memoryKey: string;
  private returnMessages: boolean;

  constructor(config: BufferMemoryConfig = {}) {
    super();
    this.humanPrefix = config.humanPrefix ?? "Human";
    this.aiPrefix = config.aiPrefix ?? "AI";
    this.memoryKey = config.memoryKey ?? "history";
    this.memoryKeys = [this.memoryKey];
    this.inputKey = config.inputKey;
    this.outputKey = config.outputKey;
    this.returnMessages = config.returnMessages ?? false;
  }

  async loadMemoryVariables(_inputs?: ChainValues): Promise<Record<string, unknown>> {
    if (this.returnMessages) {
      return { [this.memoryKey]: this.getChatMessages() };
    }
    return { [this.memoryKey]: this.getBufferString() };
  }

  async saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void> {
    const inputKey = this.inputKey ?? Object.keys(inputs)[0] ?? "input";
    const outputKey = this.outputKey ?? Object.keys(outputs)[0] ?? "output";

    const humanInput = String(inputs[inputKey] ?? "");
    const aiOutput = String(outputs[outputKey] ?? "");

    this.messages.push({ role: "human", content: humanInput });
    this.messages.push({ role: "ai", content: aiOutput });
  }

  /** Format conversation history as a string */
  getBufferString(): string {
    return this.messages
      .map((msg) => {
        const prefix = msg.role === "human" ? this.humanPrefix : this.aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join("\n");
  }

  toString(): string {
    return this.getBufferString();
  }
}
