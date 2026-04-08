import { BaseChatMemory } from "./base";
import type { ChainValues } from "../schema/types";

export interface WindowMemoryConfig {
  k?: number;
  humanPrefix?: string;
  aiPrefix?: string;
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
  returnMessages?: boolean;
}

/**
 * ConversationWindowMemory — only retains the last `k` exchanges.
 * Prevents context from growing indefinitely.
 *
 * @example
 * const memory = new ConversationWindowMemory({ k: 3 })
 * // Only the last 3 human+AI pairs are retained
 */
export class ConversationWindowMemory extends BaseChatMemory {
  memoryKeys: string[];
  private k: number;
  private humanPrefix: string;
  private aiPrefix: string;
  private memoryKey: string;
  private returnMessages: boolean;

  constructor(config: WindowMemoryConfig = {}) {
    super();
    this.k = config.k ?? 5;
    this.humanPrefix = config.humanPrefix ?? "Human";
    this.aiPrefix = config.aiPrefix ?? "AI";
    this.memoryKey = config.memoryKey ?? "history";
    this.memoryKeys = [this.memoryKey];
    this.inputKey = config.inputKey;
    this.outputKey = config.outputKey;
    this.returnMessages = config.returnMessages ?? false;
  }

  /** Get only the windowed messages */
  private getWindowedMessages() {
    // Each exchange = 2 messages (human + AI), so k exchanges = 2k messages
    const maxMessages = this.k * 2;
    return this.messages.slice(-maxMessages);
  }

  async loadMemoryVariables(_inputs?: ChainValues): Promise<Record<string, unknown>> {
    const windowed = this.getWindowedMessages();

    if (this.returnMessages) {
      return { [this.memoryKey]: windowed };
    }

    const historyString = windowed
      .map((msg) => {
        const prefix = msg.role === "human" ? this.humanPrefix : this.aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join("\n");

    return { [this.memoryKey]: historyString };
  }

  async saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void> {
    const inputKey = this.inputKey ?? Object.keys(inputs)[0] ?? "input";
    const outputKey = this.outputKey ?? Object.keys(outputs)[0] ?? "output";

    this.messages.push({ role: "human", content: String(inputs[inputKey] ?? "") });
    this.messages.push({ role: "ai", content: String(outputs[outputKey] ?? "") });

    // Trim to window size
    const maxMessages = this.k * 2;
    if (this.messages.length > maxMessages) {
      this.messages = this.messages.slice(-maxMessages);
    }
  }

  toString(): string {
    return this.getWindowedMessages()
      .map((msg) => {
        const prefix = msg.role === "human" ? this.humanPrefix : this.aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join("\n");
  }
}
