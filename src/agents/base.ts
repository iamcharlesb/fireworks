// ============================================================
// Fireworks++ — BaseAgent
// Abstract agent that plans the next action or finish decision.
// ============================================================

import type { AgentAction, AgentFinish, ChainValues } from "../schema/types";
import type { BaseTool } from "../tools/base";

/**
 * Abstract base class for all agents.
 *
 * An agent observes the current state (intermediate steps taken so far) plus
 * the original inputs, and either chooses the next tool action or decides to
 * finish by returning a final answer.
 */
export abstract class BaseAgent {
  /**
   * Given the current history of (action, observation) pairs and the original
   * chain inputs, decide what to do next.
   *
   * @returns AgentAction  — use a tool
   * @returns AgentFinish  — produce the final answer and stop
   */
  abstract plan(
    intermediateSteps: Array<[AgentAction, string]>,
    inputs: ChainValues
  ): Promise<AgentAction | AgentFinish>;

  /**
   * The set of tool names this agent is permitted to call.
   * Return `null` to allow any tool.
   */
  abstract get allowedTools(): string[] | null;

  /** Human-readable type identifier for this agent. */
  abstract get agentType(): string;

  // ------------------------------------------------------------------ helpers

  /**
   * Look up a tool by name from a list of tools.
   */
  protected getTool(tools: BaseTool[], name: string): BaseTool | undefined {
    return tools.find((t) => t.name === name);
  }

  /**
   * Produce a formatted tool catalogue suitable for inclusion in a system
   * prompt so the model knows which tools are available.
   *
   * Format:
   *   <tool-name>: <description>
   */
  protected formatTools(tools: BaseTool[]): string {
    if (tools.length === 0) return "(no tools available)";
    return tools.map((t) => `${t.name}: ${t.description}`).join("\n");
  }

  /**
   * Convert the list of (AgentAction, observation) pairs into a readable
   * string that can be appended to the conversation history.
   *
   * Format per step:
   *   Thought: <log from the action>
   *   Action: <tool name>
   *   Action Input: <tool input>
   *   Observation: <tool output>
   */
  protected formatIntermediateSteps(steps: Array<[AgentAction, string]>): string {
    if (steps.length === 0) return "";

    return steps
      .map(([action, observation]) => {
        const parts: string[] = [];
        if (action.log) {
          parts.push(action.log.trim());
        } else {
          parts.push(`Action: ${action.tool}\nAction Input: ${action.toolInput}`);
        }
        parts.push(`Observation: ${observation}`);
        return parts.join("\n");
      })
      .join("\n\n");
  }
}
