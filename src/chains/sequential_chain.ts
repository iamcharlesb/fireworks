import { BaseChain, type BaseChainConfig } from "./base";
import type { ChainValues } from "../schema/types";

export interface SequentialChainConfig extends BaseChainConfig {
  returnAll?: boolean;
}

/**
 * SequentialChain — runs a sequence of chains in order,
 * passing outputs from each chain as inputs to the next.
 *
 * @example
 * const chain1 = new LLMChain(llm, promptA, { outputKey: "summary" })
 * const chain2 = new LLMChain(llm, promptB, { outputKey: "tweet" })
 * // promptB uses {summary} as an input variable
 * const seq = new SequentialChain([chain1, chain2], ["article"], ["tweet"])
 * const result = await seq.call({ article: "..." })
 */
export class SequentialChain extends BaseChain {
  inputKeys: string[];
  outputKeys: string[];

  private chains: BaseChain[];
  private returnAll: boolean;

  constructor(
    chains: BaseChain[],
    inputVariables: string[],
    outputVariables: string[],
    config: SequentialChainConfig = {}
  ) {
    super(config);
    this.chains = chains;
    this.inputKeys = inputVariables;
    this.outputKeys = outputVariables;
    this.returnAll = config.returnAll ?? false;
  }

  _chainType(): string {
    return "sequential_chain";
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    let accumulated: ChainValues = { ...inputs };

    for (const chain of this.chains) {
      // Build input for this chain from accumulated values
      const chainInput: ChainValues = {};
      for (const key of chain.inputKeys) {
        if (key in accumulated) {
          chainInput[key] = accumulated[key];
        }
      }

      if (this.verbose) {
        console.log(`[SequentialChain] Running ${chain._chainType()} with keys: ${Object.keys(chainInput).join(", ")}`);
      }

      const chainOutput = await chain.call(chainInput, this.callbacks);
      accumulated = { ...accumulated, ...chainOutput };
    }

    if (this.returnAll) {
      return accumulated;
    }

    // Return only the declared output keys
    const result: ChainValues = {};
    for (const key of this.outputKeys) {
      if (key in accumulated) {
        result[key] = accumulated[key];
      }
    }
    return result;
  }
}

/**
 * SimpleSequentialChain — a simplified version where each chain has
 * exactly one input and one output, passed in order.
 */
export class SimpleSequentialChain extends BaseChain {
  inputKeys: string[] = ["input"];
  outputKeys: string[] = ["output"];

  private chains: BaseChain[];

  constructor(chains: BaseChain[], config: BaseChainConfig = {}) {
    super(config);
    this.chains = chains;
  }

  _chainType(): string {
    return "simple_sequential_chain";
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    let current = String(inputs["input"] ?? "");

    for (const chain of this.chains) {
      const inputKey = chain.inputKeys[0] ?? "input";
      const outputKey = chain.outputKeys[0] ?? "output";

      if (this.verbose) {
        console.log(`[SimpleSequentialChain] Passing to ${chain._chainType()}: "${current.slice(0, 80)}..."`);
      }

      const result = await chain.call({ [inputKey]: current }, this.callbacks);
      current = String(result[outputKey] ?? "");
    }

    return { output: current };
  }
}
