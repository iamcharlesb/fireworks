import { uuidv4 } from "../utils/uuid";
import type { ToolResult, CallbackHandler, FunctionDefinition } from "../schema/types";

export interface BaseToolConfig {
  callbacks?: CallbackHandler[];
  verbose?: boolean;
  returnDirect?: boolean;
}

/**
 * Abstract base class for all tools.
 * Tools can be used by agents to take actions in the world.
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;

  protected callbacks: CallbackHandler[];
  protected verbose: boolean;
  protected returnDirect: boolean;

  constructor(config: BaseToolConfig = {}) {
    this.callbacks = config.callbacks ?? [];
    this.verbose = config.verbose ?? false;
    this.returnDirect = config.returnDirect ?? false;
  }

  /**
   * Core tool execution logic — subclasses must implement.
   */
  abstract call(input: string): Promise<ToolResult>;

  /**
   * Run the tool, firing callbacks and handling errors.
   * Returns the string output.
   */
  async run(input: string, callbacks?: CallbackHandler[]): Promise<string> {
    const runId = uuidv4();
    const mergedCallbacks = [...this.callbacks, ...(callbacks ?? [])];

    if (this.verbose) {
      console.log(`[Tool:${this.name}] Input: ${input}`);
    }

    for (const cb of mergedCallbacks) {
      await cb.onToolStart?.(this.name, input, runId);
    }

    try {
      const result = await this.call(input);

      if (result.error) {
        throw new Error(result.error);
      }

      const output = result.output;

      if (this.verbose) {
        console.log(`[Tool:${this.name}] Output: ${output.slice(0, 200)}`);
      }

      for (const cb of mergedCallbacks) {
        await cb.onToolEnd?.(output, runId);
      }

      return output;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      for (const cb of mergedCallbacks) {
        await cb.onToolError?.(err, runId);
      }
      throw err;
    }
  }

  /**
   * Schema for the tool, used in function calling.
   */
  toSchema(): FunctionDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "The input to the tool"
          }
        },
        required: ["input"]
      }
    };
  }
}

/**
 * DynamicTool — create a tool from a plain function.
 *
 * @example
 * const greet = new DynamicTool({
 *   name: "greeter",
 *   description: "Greet a person by name",
 *   func: async (name) => ({ output: `Hello, ${name}!` })
 * })
 */
export class DynamicTool extends BaseTool {
  name: string;
  description: string;
  private func: (input: string) => Promise<ToolResult>;

  constructor(config: {
    name: string;
    description: string;
    func: (input: string) => Promise<ToolResult>;
    callbacks?: CallbackHandler[];
    verbose?: boolean;
    returnDirect?: boolean;
  }) {
    super(config);
    this.name = config.name;
    this.description = config.description;
    this.func = config.func;
  }

  async call(input: string): Promise<ToolResult> {
    return this.func(input);
  }
}
