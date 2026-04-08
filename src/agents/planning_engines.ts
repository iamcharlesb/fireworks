// ============================================================
// Fireworks++ — Planning Engines
// Three complementary engines for different aspects of planning:
//   ReasoningEngine — produces ReAct-style reasoning frames
//   JobEngine       — breaks a task into discrete jobs with role assignments
//   LearningEngine  — extracts recurring patterns from conversation history
// ============================================================

import type { BaseChatModel } from "../chat_models/base";
import type { Message } from "../schema/types";

// ================================================================
// ReasoningEngine
// ================================================================

export interface ReasoningFrame {
  /** The agent's current thinking about the situation. */
  thought: string;
  /** A specific hypothesis to test or assumption being made. */
  hypothesis: string;
  /** Confidence that the hypothesis is correct (0–1). */
  confidence: number;
  /** The recommended next action to advance toward a solution. */
  nextAction: string;
}

const REASONING_PROMPT = (task: string, context: string): string =>
  `You are a reasoning engine.  Given the task and current context below, produce a reasoning frame.

Task: ${task}

Context:
${context || "(no context yet)"}

Respond with a JSON object only — no markdown, no extra text:
{
  "thought": "<your current thinking about the task>",
  "hypothesis": "<a specific hypothesis or assumption you are making>",
  "confidence": <float 0.0–1.0>,
  "nextAction": "<the single most important thing to do next>"
}`;

/**
 * ReasoningEngine generates a ReAct-style reasoning frame for a task.
 */
export class ReasoningEngine {
  constructor(private llm: BaseChatModel) {}

  /**
   * Produce a reasoning frame that captures the current thinking state.
   * @param task    - The overall objective.
   * @param context - Observations or partial results gathered so far.
   */
  async reason(task: string, context: string): Promise<ReasoningFrame> {
    const prompt = REASONING_PROMPT(task, context);
    const raw = await this.llm.predict([{ role: "human", content: prompt }]);
    return this.parseFrame(raw);
  }

  private parseFrame(raw: string): ReasoningFrame {
    const cleaned = raw.replace(/```(?:json)?/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      // Best-effort fallback: return a minimal frame
      return {
        thought: cleaned.slice(0, 500),
        hypothesis: "Unable to parse structured response.",
        confidence: 0.3,
        nextAction: "Retry with a clearer prompt."
      };
    }

    return {
      thought: typeof parsed["thought"] === "string" ? parsed["thought"] : "",
      hypothesis: typeof parsed["hypothesis"] === "string" ? parsed["hypothesis"] : "",
      confidence:
        typeof parsed["confidence"] === "number"
          ? Math.max(0, Math.min(1, parsed["confidence"]))
          : 0.5,
      nextAction: typeof parsed["nextAction"] === "string" ? parsed["nextAction"] : ""
    };
  }
}

// ================================================================
// JobEngine
// ================================================================

export interface Job {
  /** Unique job identifier (e.g., "job_1"). */
  id: string;
  /** Human-readable description of what this job does. */
  description: string;
  /** Role responsible for executing this job. */
  owner: "planner" | "specialist" | "executor" | "verifier";
  /** Input data or context this job needs. */
  input: string;
  /** What a successful completion of this job should produce. */
  expectedOutput: string;
}

export interface JobPlan {
  /** Ordered list of discrete jobs. */
  jobs: Job[];
  /** IDs of jobs that form the critical path — must run sequentially. */
  criticalPath: string[];
}

const JOB_ENGINE_PROMPT = (task: string): string =>
  `You are a job decomposition engine.  Break the following task into a set of discrete, independently executable jobs.

Task: ${task}

Each job should have a clear owner role:
  - "planner"    — defines strategy and approach
  - "specialist" — applies domain expertise
  - "executor"   — performs concrete actions (tool calls, API requests, etc.)
  - "verifier"   — checks results for correctness and completeness

Respond with a JSON object only — no markdown, no extra text:
{
  "jobs": [
    {
      "id": "<short unique id, e.g. job_1>",
      "description": "<what this job does>",
      "owner": "<planner | specialist | executor | verifier>",
      "input": "<what data / context this job receives>",
      "expectedOutput": "<what a successful result looks like>"
    }
  ],
  "criticalPath": ["<job id>", ...]
}

Ordering: jobs should be listed in a reasonable execution order.  The critical path lists job ids that cannot be parallelised.`;

/**
 * JobEngine breaks a task into discrete jobs with role assignments.
 */
export class JobEngine {
  constructor(private llm: BaseChatModel) {}

  /**
   * Decompose a task into a JobPlan.
   * @param task - Natural language description of the overall goal.
   */
  async planJobs(task: string): Promise<JobPlan> {
    const prompt = JOB_ENGINE_PROMPT(task);
    const raw = await this.llm.predict([{ role: "human", content: prompt }]);
    return this.parseJobPlan(raw);
  }

  private parseJobPlan(raw: string): JobPlan {
    const cleaned = raw.replace(/```(?:json)?/g, "").trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(`JobEngine LLM returned invalid JSON: ${cleaned.slice(0, 300)}`);
    }

    const VALID_OWNERS = new Set(["planner", "specialist", "executor", "verifier"]);
    const rawJobs = Array.isArray(parsed["jobs"]) ? (parsed["jobs"] as unknown[]) : [];

    const jobs: Job[] = rawJobs.map((j, idx) => {
      const job = typeof j === "object" && j !== null ? (j as Record<string, unknown>) : {};
      const owner = VALID_OWNERS.has(job["owner"] as string)
        ? (job["owner"] as Job["owner"])
        : "executor";

      return {
        id: typeof job["id"] === "string" && job["id"].trim() ? job["id"].trim() : `job_${idx + 1}`,
        description: typeof job["description"] === "string" ? job["description"] : "",
        owner,
        input: typeof job["input"] === "string" ? job["input"] : "",
        expectedOutput: typeof job["expectedOutput"] === "string" ? job["expectedOutput"] : ""
      };
    });

    const criticalPath = Array.isArray(parsed["criticalPath"])
      ? (parsed["criticalPath"] as string[]).filter((id) => typeof id === "string")
      : jobs.map((j) => j.id);

    return { jobs, criticalPath };
  }
}

// ================================================================
// LearningEngine
// ================================================================

export interface Pattern {
  /** The trigger phrase or topic that starts the pattern. */
  trigger: string;
  /** A template capturing the recurring structure. */
  template: string;
  /** How many times this pattern was observed in the history. */
  frequency: number;
  /** Estimated fraction of times following the pattern led to success (0–1). */
  successRate: number;
}

/**
 * LearningEngine extracts recurring patterns from conversation history
 * using heuristics — no LLM call is needed.
 */
export class LearningEngine {
  /**
   * Scan the conversation history for recurring n-grams, topics and
   * intent patterns, returning a deduplicated list of Pattern objects.
   *
   * Strategy:
   *  1. Extract the text from human messages.
   *  2. Normalise and tokenise into trigrams.
   *  3. Count frequencies across all messages.
   *  4. Emit patterns for any trigram that appears more than once.
   *  5. Estimate success rate based on whether the following AI message
   *     looks helpful (heuristic: does not start with "I'm sorry" / "I cannot").
   */
  async extractPatterns(history: Message[]): Promise<Pattern[]> {
    const humanMessages = history.filter((m) => m.role === "human");
    if (humanMessages.length === 0) return [];

    // Build a map: normalised phrase → { count, successCount }
    const phraseStats = new Map<string, { count: number; successCount: number }>();

    for (let i = 0; i < humanMessages.length; i++) {
      const text = humanMessages[i].content.toLowerCase().trim();
      const tokens = text.split(/\s+/).filter((t) => t.length > 2);

      // Extract bigrams and trigrams
      for (let n = 2; n <= 3; n++) {
        for (let k = 0; k <= tokens.length - n; k++) {
          const phrase = tokens.slice(k, k + n).join(" ");
          if (phrase.length < 5) continue; // skip very short phrases

          const existing = phraseStats.get(phrase) ?? { count: 0, successCount: 0 };

          // Look for the next AI message to estimate success
          const aiIndex = history.findIndex(
            (m, idx) => idx > history.indexOf(humanMessages[i]) && m.role === "ai"
          );
          const aiMessage = aiIndex >= 0 ? history[aiIndex] : undefined;
          const wasSuccessful =
            aiMessage !== undefined &&
            !/^(i('m| am) sorry|i cannot|i can't|i'm unable|unfortunately)/i.test(
              aiMessage.content.trim()
            );

          phraseStats.set(phrase, {
            count: existing.count + 1,
            successCount: existing.successCount + (wasSuccessful ? 1 : 0)
          });
        }
      }
    }

    // Filter to phrases that appear more than once and build Pattern objects
    const patterns: Pattern[] = [];

    for (const [phrase, stats] of phraseStats.entries()) {
      if (stats.count < 2) continue;

      patterns.push({
        trigger: phrase,
        template: `When the user mentions "${phrase}", address it directly with relevant context.`,
        frequency: stats.count,
        successRate: stats.count > 0 ? stats.successCount / stats.count : 0
      });
    }

    // Sort by frequency descending, then by successRate descending
    patterns.sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return b.successRate - a.successRate;
    });

    // Return the top 20 most meaningful patterns to avoid noise
    return patterns.slice(0, 20);
  }
}
