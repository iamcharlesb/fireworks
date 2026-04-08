import type { ChainValues, Message } from "../schema/types";

/**
 * Abstract base class for all memory implementations.
 * Memory stores conversation history and provides it to chains/agents.
 */
export abstract class BaseMemory {
  /**
   * The key under which the memory output will be available to the chain.
   */
  abstract memoryKeys: string[];

  /**
   * Load all relevant memory variables for use in a chain call.
   */
  abstract loadMemoryVariables(inputs?: ChainValues): Promise<Record<string, unknown>>;

  /**
   * Save the inputs/outputs of a chain call to memory.
   */
  abstract saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void>;

  /**
   * Clear all stored memory.
   */
  abstract clear(): Promise<void>;

  /**
   * Returns a string representation of the current memory state.
   */
  abstract toString(): string;
}

/**
 * BaseChatMemory — base for memory that stores Message objects.
 */
export abstract class BaseChatMemory extends BaseMemory {
  protected messages: Message[] = [];

  inputKey?: string;
  outputKey?: string;

  /** Get all messages in the memory */
  getChatMessages(): Message[] {
    return [...this.messages];
  }

  /** Add a single message to memory */
  addMessage(message: Message): void {
    this.messages.push(message);
  }

  /** Add a user+AI exchange */
  addUserMessage(content: string): void {
    this.messages.push({ role: "human", content });
  }

  addAIMessage(content: string): void {
    this.messages.push({ role: "ai", content });
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}
