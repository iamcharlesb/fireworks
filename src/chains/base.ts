import { uuidv4 } from "../utils/uuid";
import type { ChainValues, CallbackHandler } from "../schema/types";

export interface BaseChainConfig {
  callbacks?: CallbackHandler[];
  verbose?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Abstract base class for all chains.
 * A chain is a composable unit that takes ChainValues as input and
 * returns ChainValues as output.
 */
export abstract class BaseChain {
  protected callbacks: CallbackHandler[];
  protected verbose: boolean;
  protected tags: string[];
  protected metadata: Record<string, unknown>;

  abstract inputKeys: string[];
  abstract outputKeys: string[];

  constructor(config: BaseChainConfig = {}) {
    this.callbacks = config.callbacks ?? [];
    this.verbose = config.verbose ?? false;
    this.tags = config.tags ?? [];
    this.metadata = config.metadata ?? {};
  }

  abstract _call(inputs: ChainValues): Promise<ChainValues>;

  /**
   * Run the chain with callbacks firing on start/end/error.
   */
  async call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues> {
    const runId = uuidv4();
    const mergedCallbacks = [...this.callbacks, ...(callbacks ?? [])];

    for (const cb of mergedCallbacks) {
      await cb.onChainStart?.(this.constructor.name, inputs, runId);
    }

    try {
      const outputs = await this._call(inputs);

      for (const cb of mergedCallbacks) {
        await cb.onChainEnd?.(outputs, runId);
      }

      return outputs;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const cb of mergedCallbacks) {
        await cb.onChainError?.(err, runId);
      }
      throw err;
    }
  }

  /**
   * Convenience method: pass a single string and get a string back.
   * The first inputKey is used for the input, first outputKey for the output.
   */
  async run(input: string, callbacks?: CallbackHandler[]): Promise<string> {
    const inputKey = this.inputKeys[0];
    if (!inputKey) {
      throw new Error(`${this.constructor.name} has no defined inputKeys`);
    }
    const outputKey = this.outputKeys[0];
    if (!outputKey) {
      throw new Error(`${this.constructor.name} has no defined outputKeys`);
    }

    const result = await this.call({ [inputKey]: input }, callbacks);
    const output = result[outputKey];
    if (typeof output !== "string") {
      return String(output ?? "");
    }
    return output;
  }

  /**
   * Apply the chain to a list of inputs (batch processing).
   */
  async apply(
    inputs: ChainValues[],
    callbacks?: CallbackHandler[]
  ): Promise<ChainValues[]> {
    return Promise.all(inputs.map((inp) => this.call(inp, callbacks)));
  }

  /** Returns the chain type name */
  abstract _chainType(): string;

  toJSON(): Record<string, unknown> {
    return {
      _type: this._chainType(),
      inputKeys: this.inputKeys,
      outputKeys: this.outputKeys
    };
  }
}
