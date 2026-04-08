import { BaseChain, type BaseChainConfig } from "./base";
import type { ChainValues } from "../schema/types";

export type TransformFunction = (inputs: ChainValues) => ChainValues | Promise<ChainValues>;

export interface TransformChainConfig extends BaseChainConfig {
  inputVariables: string[];
  outputVariables: string[];
  transform: TransformFunction;
}

/**
 * TransformChain — applies a custom transformation function to chain values.
 * Useful for data manipulation between chains.
 *
 * @example
 * const uppercase = new TransformChain({
 *   inputVariables: ["text"],
 *   outputVariables: ["upperText"],
 *   transform: (inputs) => ({ upperText: String(inputs.text).toUpperCase() })
 * })
 * const result = await uppercase.call({ text: "hello" })
 * // { upperText: "HELLO" }
 */
export class TransformChain extends BaseChain {
  inputKeys: string[];
  outputKeys: string[];
  private transformFn: TransformFunction;

  constructor(config: TransformChainConfig) {
    super(config);
    this.inputKeys = config.inputVariables;
    this.outputKeys = config.outputVariables;
    this.transformFn = config.transform;
  }

  _chainType(): string {
    return "transform_chain";
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const result = await this.transformFn(inputs);
    return result;
  }
}
