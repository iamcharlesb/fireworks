// ============================================================
// Fireworks++ — ReActAgent
// Reasoning + Acting agent using the ReAct prompting pattern.
//
// Loop: Thought → Action → Action Input → Observation → (repeat)
// Terminates when the model outputs "Final Answer: <text>"
// ============================================================

import type { AgentAction, AgentFinish, ChainValues, Message } from "../schema/types";
import type { BaseChatModel } from "../chat_models/base";
import type { BaseMemory } from "../memory/base";
import type { BaseTool } from "../tools/base";
import { BaseAgent } from "./base";

const REACT_SYSTEM_TEMPLATE = (toolList: string) =>
  `You are an intelligent agent that can use tools to answer questions and complete tasks.

Available tools:
${toolList}

To use a tool, respond in the following format (and nothing else on those lines):

Thought: <your reasoning about what to do next>
Action: <tool name — must be one of the tools listed above>
Action Input: <the exact input string to pass to the tool>

After you receive an observation from the tool, continue with another Thought/Action/Action Input cycle.

When you have enough information to answer the user, respond in the following format:

Thought: <final reasoning>
Final Answer: <your complete answer to the user>

Rules:
- ALWAYS begin with a Thought.
- NEVER output markdown code fences around the Action or Action Input lines.
- NEVER call a tool not listed above.
- The Action Input must be a single string — not JSON unless the tool explicitly requires it.`;

/**
 * ReActAgent implements the Reasoning + Acting pattern.
 *
 * It builds a message history, sends it to the LLM, then parses the response
 * to extract either a tool call (AgentAction) or a final answer (AgentFinish).
 */
export class ReActAgent extends BaseAgent {
  readonly agentType = "react";

  constructor(
    private llm: BaseChatModel,
    private tools: BaseTool[],
    private memory?: BaseMemory,
    private systemPrompt?: string
  ) {
    super();
  }

  get allowedTools(): string[] {
    return this.tools.map((t) => t.name);
  }

  /**
   * Plan the next step given the current intermediate steps and inputs.
   */
  async plan(
    intermediateSteps: Array<[AgentAction, string]>,
    inputs: ChainValues
  ): Promise<AgentAction | AgentFinish> {
    const messages = await this.buildMessages(intermediateSteps, inputs);
    const response = await this.llm.call(messages);
    return this.parseOutput(response.content);
  }

  // ------------------------------------------------------------------ private

  /**
   * Construct the full message list that will be sent to the LLM.
   *
   * Layout:
   *   [system]  — ReAct instructions + tool list
   *   [memory]  — prior conversation turns if memory is attached
   *   [human]   — the task / user question
   *   [ai/human] — one ai + one human message per completed step
   */
  private async buildMessages(
    intermediateSteps: Array<[AgentAction, string]>,
    inputs: ChainValues
  ): Promise<Message[]> {
    const toolList = this.formatTools(this.tools);
    const systemContent = this.systemPrompt
      ? `${this.systemPrompt}\n\n${REACT_SYSTEM_TEMPLATE(toolList)}`
      : REACT_SYSTEM_TEMPLATE(toolList);

    const messages: Message[] = [{ role: "system", content: systemContent }];

    // Inject memory messages if available
    if (this.memory) {
      const memoryVars = await this.memory.loadMemoryVariables(inputs);
      const historyKey = Object.keys(memoryVars)[0];
      const history = historyKey ? memoryVars[historyKey] : undefined;

      if (Array.isArray(history)) {
        messages.push(...(history as Message[]));
      } else if (typeof history === "string" && history.trim()) {
        messages.push({ role: "system", content: `Conversation history:\n${history}` });
      }
    }

    // Primary human input
    const input =
      typeof inputs["input"] === "string"
        ? inputs["input"]
        : typeof inputs["question"] === "string"
        ? inputs["question"]
        : String(Object.values(inputs)[0] ?? "");

    messages.push({ role: "human", content: input });

    // Add completed (action → observation) turns as alternating AI / human messages
    for (const [action, observation] of intermediateSteps) {
      const agentText = action.log.trim() || `Action: ${action.tool}\nAction Input: ${action.toolInput}`;
      messages.push({ role: "ai", content: agentText });
      messages.push({ role: "human", content: `Observation: ${observation}` });
    }

    return messages;
  }

  /**
   * Parse the LLM's raw text output into an AgentAction or AgentFinish.
   *
   * Looks for:
   *   "Final Answer: <text>"  → AgentFinish
   *   "Action: <tool>\nAction Input: <input>"  → AgentAction
   */
  private parseOutput(output: string): AgentAction | AgentFinish {
    const text = output.trim();

    // --- Final Answer ---
    const finalAnswerMatch = text.match(/Final\s+Answer\s*:\s*([\s\S]+)$/i);
    if (finalAnswerMatch) {
      return {
        returnValues: { output: finalAnswerMatch[1].trim() },
        log: text
      };
    }

    // --- Tool Action ---
    const actionMatch = text.match(/Action\s*:\s*(.+)/i);
    const actionInputMatch = text.match(/Action\s+Input\s*:\s*([\s\S]+?)(?:\nObservation|\nThought|$)/i);

    if (actionMatch) {
      const tool = actionMatch[1].trim();
      const toolInput = actionInputMatch ? actionInputMatch[1].trim() : "";
      return {
        tool,
        toolInput,
        log: text
      };
    }

    // Could not parse — treat the entire output as a final answer to avoid
    // getting stuck in an infinite loop.
    return {
      returnValues: { output: text },
      log: text
    };
  }
}
