import { BaseChatMemory } from "./base";
import type { ChainValues, Message } from "../schema/types";
import type { BaseChatModel } from "../chat_models/base";

export interface SummaryMemoryConfig {
  llm: BaseChatModel;
  humanPrefix?: string;
  aiPrefix?: string;
  memoryKey?: string;
  inputKey?: string;
  outputKey?: string;
  maxTokenLimit?: number;
  summaryPrompt?: string;
}

/**
 * ConversationSummaryMemory — summarizes the conversation history using an LLM
 * to keep the context window manageable for long conversations.
 *
 * @example
 * const llm = new ChatAnthropic({ apiKey: "..." })
 * const memory = new ConversationSummaryMemory({ llm })
 */
export class ConversationSummaryMemory extends BaseChatMemory {
  memoryKeys: string[];
  private llm: BaseChatModel;
  private humanPrefix: string;
  private aiPrefix: string;
  private memoryKey: string;
  private maxTokenLimit: number;
  private summary: string = "";
  private summaryPrompt: string;

  constructor(config: SummaryMemoryConfig) {
    super();
    this.llm = config.llm;
    this.humanPrefix = config.humanPrefix ?? "Human";
    this.aiPrefix = config.aiPrefix ?? "AI";
    this.memoryKey = config.memoryKey ?? "history";
    this.memoryKeys = [this.memoryKey];
    this.inputKey = config.inputKey;
    this.outputKey = config.outputKey;
    this.maxTokenLimit = config.maxTokenLimit ?? 2000;
    this.summaryPrompt =
      config.summaryPrompt ??
      "Progressively summarize the lines of conversation provided, adding onto the previous summary returning a new summary.\n\nCurrent summary:\n{summary}\n\nNew lines of conversation:\n{new_lines}\n\nNew summary:";
  }

  private formatMessages(messages: Message[]): string {
    return messages
      .map((msg) => {
        const prefix = msg.role === "human" ? this.humanPrefix : this.aiPrefix;
        return `${prefix}: ${msg.content}`;
      })
      .join("\n");
  }

  /** Estimate token count (rough: 4 chars ~ 1 token) */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Summarize new messages and update the running summary.
   */
  private async updateSummary(newMessages: Message[]): Promise<void> {
    if (newMessages.length === 0) return;

    const newLines = this.formatMessages(newMessages);
    const prompt = this.summaryPrompt
      .replace("{summary}", this.summary || "No previous summary.")
      .replace("{new_lines}", newLines);

    const reply = await this.llm.call([{ role: "human", content: prompt }]);
    this.summary = reply.content;
  }

  async loadMemoryVariables(_inputs?: ChainValues): Promise<Record<string, unknown>> {
    const recentHistory = this.formatMessages(this.messages);
    const fullHistory = this.summary
      ? `Summary:\n${this.summary}\n\nRecent:\n${recentHistory}`
      : recentHistory;

    return { [this.memoryKey]: fullHistory };
  }

  async saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void> {
    const inputKey = this.inputKey ?? Object.keys(inputs)[0] ?? "input";
    const outputKey = this.outputKey ?? Object.keys(outputs)[0] ?? "output";

    const humanMsg: Message = { role: "human", content: String(inputs[inputKey] ?? "") };
    const aiMsg: Message = { role: "ai", content: String(outputs[outputKey] ?? "") };

    this.messages.push(humanMsg, aiMsg);

    // Check if we need to summarize
    const bufferText = this.formatMessages(this.messages);
    if (this.estimateTokens(bufferText) > this.maxTokenLimit) {
      // Summarize all but the last exchange
      const toSummarize = this.messages.slice(0, -2);
      await this.updateSummary(toSummarize);
      this.messages = this.messages.slice(-2);
    }
  }

  async clear(): Promise<void> {
    this.messages = [];
    this.summary = "";
  }

  getSummary(): string {
    return this.summary;
  }

  toString(): string {
    const recent = this.formatMessages(this.messages);
    return this.summary ? `Summary:\n${this.summary}\n\nRecent:\n${recent}` : recent;
  }
}
