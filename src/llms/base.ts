import { uuidv4 } from "../utils/uuid";
import type {
  LLMResult,
  RunOptions,
  StreamCallback,
  StreamingChunk,
  CallbackHandler,
  Generation
} from "../schema/types";

export interface BaseLLMConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  timeout?: number;
  callbacks?: CallbackHandler[];
  verbose?: boolean;
}

/**
 * Abstract base class for all LLM (text completion) providers.
 * Subclasses implement `generate()` and `_llmType()`.
 */
export abstract class BaseLLM {
  protected temperature: number;
  protected maxTokens: number;
  protected topP: number;
  protected stop: string[];
  protected timeout: number;
  protected callbacks: CallbackHandler[];
  protected verbose: boolean;

  abstract modelName: string;

  constructor(config: BaseLLMConfig = {}) {
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
    this.topP = config.topP ?? 1.0;
    this.stop = config.stop ?? [];
    this.timeout = config.timeout ?? 60_000;
    this.callbacks = config.callbacks ?? [];
    this.verbose = config.verbose ?? false;
  }

  /** Return the type string that identifies this LLM class */
  abstract _llmType(): string;

  /** Core generation method — subclasses must implement */
  abstract generate(prompts: string[], options?: RunOptions): Promise<LLMResult>;

  /**
   * Convenience method: call with a single prompt string, return the text.
   */
  async call(prompt: string, options?: RunOptions): Promise<string> {
    const runId = uuidv4();
    const mergedCallbacks = [...this.callbacks, ...(options?.callbacks ?? [])];

    // Fire onLLMStart callbacks
    for (const cb of mergedCallbacks) {
      await cb.onLLMStart?.(this._llmType(), [prompt], runId);
    }

    try {
      const result = await this.generate([prompt], options);

      // Fire onLLMEnd callbacks
      for (const cb of mergedCallbacks) {
        await cb.onLLMEnd?.(result, runId);
      }

      const firstGen: Generation | undefined = result.generations[0]?.[0];
      return firstGen?.text ?? "";
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const cb of mergedCallbacks) {
        await cb.onLLMError?.(err, runId);
      }
      throw err;
    }
  }

  /**
   * Stream tokens from the LLM, calling `callback` for each chunk.
   * Subclasses may override for native streaming; default falls back to call().
   */
  async stream(prompt: string, callback: StreamCallback, options?: RunOptions): Promise<void> {
    // Default implementation: do a single call and deliver all at once
    const text = await this.call(prompt, options);
    const chunk: StreamingChunk = {
      text,
      isFirst: true,
      isFinal: true,
      metadata: { model: this.modelName }
    };
    await callback(chunk);
  }

  /**
   * Predict — alias for call(), provided for LangChain compatibility.
   */
  async predict(text: string, options?: RunOptions): Promise<string> {
    return this.call(text, options);
  }

  /** Serialize the LLM config for caching/debugging */
  toJSON(): Record<string, unknown> {
    return {
      _type: this._llmType(),
      modelName: this.modelName,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      topP: this.topP,
      stop: this.stop
    };
  }
}
