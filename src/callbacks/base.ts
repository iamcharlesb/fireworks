// ============================================================
// Fireworks++ — BaseCallbackHandler
// Abstract callback handler with default no-op implementations.
// Subclasses override only the lifecycle events they care about.
// ============================================================

import type { LLMResult, ChainValues, AgentAction, AgentFinish, CallbackHandler } from "../schema/types";

/**
 * Abstract base class for callback handlers.
 * All methods have default no-op implementations so subclasses can
 * selectively override only the events they need.
 */
export abstract class BaseCallbackHandler implements CallbackHandler {
  /**
   * Called when an LLM starts processing.
   * @param llmName  - The model type identifier
   * @param prompts  - The prompt strings sent to the model
   * @param runId    - Unique run identifier
   */
  async onLLMStart(llmName: string, prompts: string[], runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when an LLM completes successfully.
   * @param response - The full LLMResult
   * @param runId    - Unique run identifier
   */
  async onLLMEnd(response: LLMResult, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when an LLM throws an error.
   * @param error  - The thrown error
   * @param runId  - Unique run identifier
   */
  async onLLMError(error: Error, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called for each new streamed token from an LLM.
   * @param token  - The streamed token string
   * @param runId  - Unique run identifier
   */
  async onLLMNewToken(token: string, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a chain starts executing.
   * @param chainName - The chain class name
   * @param inputs    - The input ChainValues
   * @param runId     - Unique run identifier
   */
  async onChainStart(chainName: string, inputs: ChainValues, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a chain completes successfully.
   * @param outputs - The output ChainValues
   * @param runId   - Unique run identifier
   */
  async onChainEnd(outputs: ChainValues, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a chain throws an error.
   * @param error  - The thrown error
   * @param runId  - Unique run identifier
   */
  async onChainError(error: Error, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a tool starts executing.
   * @param toolName - The tool's name
   * @param input    - The string input passed to the tool
   * @param runId    - Unique run identifier
   */
  async onToolStart(toolName: string, input: string, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a tool completes successfully.
   * @param output - The string output returned by the tool
   * @param runId  - Unique run identifier
   */
  async onToolEnd(output: string, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when a tool throws an error.
   * @param error  - The thrown error
   * @param runId  - Unique run identifier
   */
  async onToolError(error: Error, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when an agent decides to take an action (use a tool).
   * @param action - The AgentAction describing the chosen tool and input
   * @param runId  - Unique run identifier
   */
  async onAgentAction(action: AgentAction, runId: string): Promise<void> {
    // no-op default
  }

  /**
   * Called when an agent produces a final answer and finishes.
   * @param finish - The AgentFinish with return values
   * @param runId  - Unique run identifier
   */
  async onAgentFinish(finish: AgentFinish, runId: string): Promise<void> {
    // no-op default
  }
}
