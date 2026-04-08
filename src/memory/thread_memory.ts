import { BaseMemory } from "./base";
import type { ChainValues, Message } from "../schema/types";
import { uuidv4 } from "../utils/uuid";

export interface ThreadMemoryConfig {
  maxThreads?: number;
  maxMessagesPerThread?: number;
  defaultThreadId?: string;
}

export interface ThreadSummary {
  id: string;
  messageCount: number;
  firstMessage?: string;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ThreadedMemory — multi-thread conversation memory inspired by topcode.
 * Each thread is an isolated conversation that can be switched between.
 * Useful for chat applications managing multiple independent conversations.
 *
 * @example
 * const memory = new ThreadedMemory()
 * const thread1 = memory.createThread()
 * await memory.addToThread(thread1, { role: "human", content: "Hello!" })
 * const messages = await memory.getThread(thread1)
 */
export class ThreadedMemory extends BaseMemory {
  memoryKeys: string[] = ["history", "threadId"];

  private threads: Map<string, Message[]> = new Map();
  private threadMetadata: Map<string, { createdAt: Date; updatedAt: Date }> = new Map();
  private activeThreadId: string;
  private maxThreads: number;
  private maxMessagesPerThread: number;

  constructor(config: ThreadMemoryConfig = {}) {
    super();
    this.maxThreads = config.maxThreads ?? 100;
    this.maxMessagesPerThread = config.maxMessagesPerThread ?? 1000;
    this.activeThreadId = config.defaultThreadId ?? this.createThread();
  }

  /**
   * Create a new thread and return its ID.
   */
  createThread(id?: string): string {
    const threadId = id ?? `thread-${uuidv4().slice(0, 8)}`;

    // Evict oldest thread if at capacity
    if (this.threads.size >= this.maxThreads && !this.threads.has(threadId)) {
      const oldestId = this.threads.keys().next().value;
      if (oldestId) {
        this.threads.delete(oldestId);
        this.threadMetadata.delete(oldestId);
      }
    }

    this.threads.set(threadId, []);
    this.threadMetadata.set(threadId, {
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return threadId;
  }

  /**
   * Switch the active thread.
   */
  setActiveThread(threadId: string): void {
    if (!this.threads.has(threadId)) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    this.activeThreadId = threadId;
  }

  getActiveThreadId(): string {
    return this.activeThreadId;
  }

  /**
   * Get all messages in a thread.
   */
  async getThread(threadId: string): Promise<Message[]> {
    return [...(this.threads.get(threadId) ?? [])];
  }

  /**
   * Add a message to a thread.
   */
  async addToThread(threadId: string, message: Message): Promise<void> {
    if (!this.threads.has(threadId)) {
      this.createThread(threadId);
    }

    const messages = this.threads.get(threadId)!;

    // Trim to max size
    if (messages.length >= this.maxMessagesPerThread) {
      messages.splice(0, 2); // Remove oldest exchange
    }

    messages.push(message);

    const meta = this.threadMetadata.get(threadId);
    if (meta) {
      meta.updatedAt = new Date();
    }
  }

  /**
   * Get messages for the active thread.
   */
  async getActiveThreadMessages(): Promise<Message[]> {
    return this.getThread(this.activeThreadId);
  }

  /**
   * Load memory variables for use in chain calls.
   */
  async loadMemoryVariables(_inputs?: ChainValues): Promise<Record<string, unknown>> {
    const messages = await this.getActiveThreadMessages();
    const history = messages
      .map((msg) => {
        const prefix = msg.role === "human" ? "Human" : "AI";
        return `${prefix}: ${msg.content}`;
      })
      .join("\n");

    return {
      history,
      threadId: this.activeThreadId,
      messages
    };
  }

  /**
   * Save an input/output exchange to the active thread.
   */
  async saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void> {
    const inputKey = Object.keys(inputs)[0] ?? "input";
    const outputKey = Object.keys(outputs)[0] ?? "output";

    await this.addToThread(this.activeThreadId, {
      role: "human",
      content: String(inputs[inputKey] ?? "")
    });
    await this.addToThread(this.activeThreadId, {
      role: "ai",
      content: String(outputs[outputKey] ?? "")
    });
  }

  /**
   * Clear a specific thread or all threads.
   */
  async clearThread(threadId: string): Promise<void> {
    if (this.threads.has(threadId)) {
      this.threads.set(threadId, []);
      const meta = this.threadMetadata.get(threadId);
      if (meta) {
        meta.updatedAt = new Date();
      }
    }
  }

  async clear(): Promise<void> {
    this.threads.clear();
    this.threadMetadata.clear();
    this.activeThreadId = this.createThread();
  }

  /**
   * List all thread summaries.
   */
  listThreads(): ThreadSummary[] {
    return Array.from(this.threads.entries()).map(([id, messages]) => {
      const meta = this.threadMetadata.get(id);
      return {
        id,
        messageCount: messages.length,
        firstMessage: messages[0]?.content?.slice(0, 50),
        lastMessage: messages.at(-1)?.content?.slice(0, 50),
        createdAt: meta?.createdAt ?? new Date(),
        updatedAt: meta?.updatedAt ?? new Date()
      };
    });
  }

  /**
   * Delete a thread entirely.
   */
  deleteThread(threadId: string): void {
    this.threads.delete(threadId);
    this.threadMetadata.delete(threadId);
    if (this.activeThreadId === threadId) {
      const remaining = this.threads.keys().next().value;
      this.activeThreadId = remaining ?? this.createThread();
    }
  }

  toString(): string {
    const messages = this.threads.get(this.activeThreadId) ?? [];
    return messages
      .map((m) => `${m.role === "human" ? "Human" : "AI"}: ${m.content}`)
      .join("\n");
  }
}
