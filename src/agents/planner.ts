// ============================================================
// Fireworks++ — AgentPlanner
// Multi-step planner: uses an LLM to create a structured plan
// before any tools are invoked.
// ============================================================

import { uuidv4 } from "../utils/uuid";
import type { BaseChatModel } from "../chat_models/base";
import type { BaseTool } from "../tools/base";

export interface PlanStep {
  /** Unique identifier for this step. */
  id: string;
  /** Human-readable description of what this step accomplishes. */
  description: string;
  /** Name of the tool to use for this step, if any. */
  tool?: string;
  /** IDs of steps that must complete before this one can start. */
  dependencies: string[];
  /** Role responsible for executing this step. */
  owner: "planner" | "specialist" | "executor" | "verifier";
}

export interface AgentPlan {
  /** The original task description. */
  task: string;
  /** Ordered list of steps to execute the plan. */
  steps: PlanStep[];
  /** LLM-generated reasoning explaining the plan structure. */
  reasoning: string;
  /** Tool names expected to be used across the plan. */
  estimatedTools: string[];
  /** 0–1 confidence the plan is complete and correct. */
  confidence: number;
}

const BUILD_PLAN_PROMPT = (task: string, toolList: string): string =>
  `You are a careful planning agent.  Your job is to break down the following task into a structured, step-by-step execution plan.

Available tools:
${toolList || "(none)"}

Task:
"""${task}"""

Produce a JSON object — and ONLY a JSON object — in this exact schema:
{
  "reasoning": "<why you structured the plan this way>",
  "confidence": <float 0.0–1.0>,
  "estimatedTools": ["<tool name>", ...],
  "steps": [
    {
      "id": "<short unique id, e.g. step_1>",
      "description": "<what this step does>",
      "tool": "<tool name or null if no tool needed>",
      "dependencies": ["<id of prerequisite step>", ...],
      "owner": "<one of: planner | specialist | executor | verifier>"
    }
  ]
}

Rules:
- Use only tools from the available list above (or omit "tool" if none applies).
- Dependencies must reference step ids that appear earlier in the list.
- The last step should typically be owned by "verifier" to validate the output.
- Respond with valid JSON only — no markdown, no extra text.`;

const REFINE_PLAN_PROMPT = (plan: AgentPlan, feedback: string): string =>
  `You are a careful planning agent.  You previously produced the following execution plan:

${JSON.stringify(plan, null, 2)}

The plan was executed and the following feedback / errors were encountered:
"""${feedback}"""

Revise the plan to address the feedback.  Return an updated JSON object with the same schema as the original plan (reasoning, confidence, estimatedTools, steps).  Respond with valid JSON only — no markdown, no extra text.`;

/**
 * AgentPlanner creates and refines structured execution plans using an LLM.
 */
export class AgentPlanner {
  constructor(private llm: BaseChatModel) {}

  /**
   * Build an initial execution plan for the given task.
   * @param task           - The user's goal in natural language.
   * @param availableTools - Tools the agent has access to.
   */
  async buildPlan(task: string, availableTools: BaseTool[]): Promise<AgentPlan> {
    const toolList = availableTools.map((t) => `${t.name}: ${t.description}`).join("\n");
    const prompt = BUILD_PLAN_PROMPT(task, toolList);

    const raw = await this.llm.predict([{ role: "human", content: prompt }]);
    const parsed = this.parseJson(raw);

    return this.normalizePlan(task, parsed);
  }

  /**
   * Refine an existing plan in response to execution feedback or errors.
   * @param plan     - The previous plan produced by buildPlan.
   * @param feedback - Error messages or observations from the executor.
   */
  async refinePlan(plan: AgentPlan, feedback: string): Promise<AgentPlan> {
    const prompt = REFINE_PLAN_PROMPT(plan, feedback);
    const raw = await this.llm.predict([{ role: "human", content: prompt }]);
    const parsed = this.parseJson(raw);

    return this.normalizePlan(plan.task, parsed);
  }

  // ------------------------------------------------------------------ private

  private parseJson(raw: string): Record<string, unknown> {
    const cleaned = raw.replace(/```(?:json)?/g, "").trim();
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(`Planner LLM returned invalid JSON: ${cleaned.slice(0, 300)}`);
    }
  }

  private normalizePlan(task: string, parsed: Record<string, unknown>): AgentPlan {
    const VALID_OWNERS = new Set(["planner", "specialist", "executor", "verifier"]);

    const rawSteps = Array.isArray(parsed["steps"]) ? (parsed["steps"] as unknown[]) : [];

    const steps: PlanStep[] = rawSteps.map((s, idx) => {
      const step = typeof s === "object" && s !== null ? (s as Record<string, unknown>) : {};
      const owner = VALID_OWNERS.has(step["owner"] as string)
        ? (step["owner"] as PlanStep["owner"])
        : "executor";

      return {
        id: typeof step["id"] === "string" && step["id"].trim() ? step["id"].trim() : `step_${idx + 1}`,
        description: typeof step["description"] === "string" ? step["description"] : "",
        tool: typeof step["tool"] === "string" && step["tool"].trim() ? step["tool"].trim() : undefined,
        dependencies: Array.isArray(step["dependencies"])
          ? (step["dependencies"] as string[]).filter((d) => typeof d === "string")
          : [],
        owner
      };
    });

    const estimatedTools = Array.isArray(parsed["estimatedTools"])
      ? (parsed["estimatedTools"] as string[]).filter((t) => typeof t === "string")
      : steps.filter((s) => s.tool).map((s) => s.tool as string);

    const confidence =
      typeof parsed["confidence"] === "number"
        ? Math.max(0, Math.min(1, parsed["confidence"]))
        : 0.75;

    return {
      task,
      steps,
      reasoning: typeof parsed["reasoning"] === "string" ? parsed["reasoning"] : "",
      estimatedTools: [...new Set(estimatedTools)],
      confidence
    };
  }
}
