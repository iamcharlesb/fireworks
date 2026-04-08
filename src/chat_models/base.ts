import { uuidv4 } from "../utils/uuid";
import type {
  Message,
  LLMResult,
  RunOptions,
  StreamCallback,
  StreamingChunk,
  CallbackHandler,
  FunctionDefinition,
  Generation,
  StructuredOutputSchema,
  ToolCallOptions
} from "../schema/types";

export interface BaseChatModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  timeout?: number;
  callbacks?: CallbackHandler[];
  verbose?: boolean;
  streaming?: boolean;
}

/**
 * Abstract base class for all chat model providers.
 * Subclasses implement `generate()` for batch completions.
 */
export abstract class BaseChatModel {
  protected temperature: number;
  protected maxTokens: number;
  protected topP: number;
  protected stop: string[];
  protected timeout: number;
  protected callbacks: CallbackHandler[];
  protected verbose: boolean;
  protected streaming: boolean;

  abstract modelName: string;

  constructor(config: BaseChatModelConfig = {}) {
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
    this.topP = config.topP ?? 1.0;
    this.stop = config.stop ?? [];
    this.timeout = config.timeout ?? 60_000;
    this.callbacks = config.callbacks ?? [];
    this.verbose = config.verbose ?? false;
    this.streaming = config.streaming ?? false;
  }

  abstract _modelType(): string;

  /**
   * Core batch generate — accepts a list of message lists,
   * returns LLMResult with parallel generations.
   */
  abstract generate(messages: Message[][], options?: RunOptions): Promise<LLMResult>;

  /**
   * Call the model with a single conversation, return the AI reply message.
   */
  async call(messages: Message[], options?: RunOptions): Promise<Message> {
    const runId = uuidv4();
    const mergedCallbacks = [...this.callbacks, ...(options?.callbacks ?? [])];

    const promptStrings = messages.map((m) => `${m.role}: ${m.content}`);
    for (const cb of mergedCallbacks) {
      await cb.onLLMStart?.(this._modelType(), promptStrings, runId);
    }

    try {
      const result = await this.generate([messages], options);

      for (const cb of mergedCallbacks) {
        await cb.onLLMEnd?.(result, runId);
      }

      const firstGen: Generation | undefined = result.generations[0]?.[0];
      if (firstGen?.message) {
        return firstGen.message;
      }
      return { role: "ai", content: firstGen?.text ?? "" };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const cb of mergedCallbacks) {
        await cb.onLLMError?.(err, runId);
      }
      throw err;
    }
  }

  /**
   * Predict — convenience method that takes messages, returns string content.
   */
  async predict(messages: Message[], options?: RunOptions): Promise<string> {
    const reply = await this.call(messages, options);
    return reply.content;
  }

  /**
   * Stream tokens from the chat model.
   * Subclasses should override for native streaming support.
   */
  async stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void> {
    const reply = await this.call(messages, options);
    const chunk: StreamingChunk = {
      text: reply.content,
      isFirst: true,
      isFinal: true,
      metadata: { model: this.modelName }
    };
    await callback(chunk);
  }

  /**
   * Invoke — LangChain-style alias for call().
   */
  async invoke(messages: Message[], options?: RunOptions): Promise<Message> {
    return this.call(messages, options);
  }

  /**
   * Native tool calling. Subclasses should override when the provider supports it.
   */
  async callWithTools(
    _messages: Message[],
    _tools: FunctionDefinition[],
    _options?: ToolCallOptions
  ): Promise<Message> {
    throw new Error(`${this._modelType()} does not support native tool calling.`);
  }

  /**
   * Native structured output. Subclasses should override when the provider supports it.
   */
  async generateStructured<T>(
    _messages: Message[],
    _schema: StructuredOutputSchema,
    _options?: RunOptions
  ): Promise<T> {
    throw new Error(`${this._modelType()} does not support native structured output.`);
  }

  protected parseJsonText<T>(text: string): T {
    const cleaned = text.replace(/```(?:json)?/g, "").trim();
    return JSON.parse(cleaned) as T;
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: this._modelType(),
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      topP: this.topP
    };
  }
}
