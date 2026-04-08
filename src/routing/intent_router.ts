// ============================================================
// Fireworks++ — IntentRouter
// Combines heuristic + LLM-based routing with graceful fallback.
// ============================================================

import type { RouteDecision, RouteKind } from "../schema/types";
import type { BaseChatModel } from "../chat_models/base";
import { HeuristicRouter } from "./heuristic_router";

export interface IntentRouterOptions {
  /**
   * When the heuristic confidence falls below this threshold the router
   * will call the LLM for a more accurate classification.
   * Default: 0.7
   */
  confidenceThreshold?: number;
  /** Milliseconds to wait for the LLM classification before giving up. */
  timeout?: number;
}

const ROUTE_KINDS: RouteKind[] = [
  "llm",
  "ssh",
  "browser",
  "research",
  "document",
  "editor",
  "skill",
  "calculator"
];

const CLASSIFICATION_PROMPT = (input: string): string =>
  `You are an intent classifier.  Classify the following user input into EXACTLY ONE of these route kinds:
${ROUTE_KINDS.map((k) => `  - "${k}"`).join("\n")}

Definitions:
  "llm"        – General conversational query; no specific tool needed.
  "ssh"        – Connecting to or executing commands on a remote server via SSH/SFTP.
  "browser"    – Navigating to a URL, interacting with web pages, or web scraping.
  "research"   – Looking up facts, searching the web, or reading Wikipedia.
  "document"   – Creating, editing, or exporting documents, PDFs, spreadsheets.
  "editor"     – Opening a file or directory in a code editor (VSCode, vim, etc.).
  "skill"      – Invoking a named automation skill or workflow pipeline.
  "calculator" – Performing arithmetic or mathematical computations.

User input:
"""${input}"""

Respond with a JSON object and nothing else:
{
  "kind": "<one of the route kinds above>",
  "confidence": <float 0.0–1.0>,
  "reasoning": "<one short sentence>"
}`;

/**
 * IntentRouter tries heuristic classification first.  If the heuristic result
 * is below the confidence threshold AND an LLM is available, it calls the LLM
 * for a more nuanced classification.
 */
export class IntentRouter {
  private heuristic: HeuristicRouter;
  private confidenceThreshold: number;
  private timeout: number;

  constructor(
    private llm?: BaseChatModel,
    private options: IntentRouterOptions = {}
  ) {
    this.heuristic = new HeuristicRouter();
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
    this.timeout = options.timeout ?? 15_000;
  }

  /**
   * Route the input, optionally consulting the LLM for low-confidence cases.
   */
  async route(input: string): Promise<RouteDecision> {
    const heuristicResult = this.heuristic.route(input);

    // Fast path: heuristic is confident enough, or no LLM is configured
    if (heuristicResult.confidence >= this.confidenceThreshold || !this.llm) {
      return heuristicResult;
    }

    // Slow path: use LLM to refine
    try {
      const llmResult = await this.classifyWithLLM(input);
      return llmResult;
    } catch {
      // If the LLM call fails for any reason, fall back to the heuristic result
      return {
        ...heuristicResult,
        reasoning: `${heuristicResult.reasoning ?? ""} (LLM classification failed; heuristic fallback used.)`
      };
    }
  }

  /**
   * Alias for callers that want the full RouteDecision explicitly.
   */
  async routeWithConfidence(input: string): Promise<RouteDecision> {
    return this.route(input);
  }

  // ------------------------------------------------------------------ private

  private async classifyWithLLM(input: string): Promise<RouteDecision> {
    const prompt = CLASSIFICATION_PROMPT(input);

    const responsePromise = this.llm!.predict([
      { role: "human", content: prompt }
    ]);

    // Wrap in a timeout so a slow LLM doesn't block forever
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("LLM intent classification timed out")), this.timeout)
    );

    const raw = await Promise.race([responsePromise, timeoutPromise]);

    return this.parseLLMResponse(raw);
  }

  private parseLLMResponse(raw: string): RouteDecision {
    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.replace(/```(?:json)?/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(`LLM returned non-JSON response: ${cleaned.slice(0, 200)}`);
    }

    const kind = parsed["kind"] as string;
    if (!ROUTE_KINDS.includes(kind as RouteKind)) {
      throw new Error(`LLM returned unknown route kind: "${kind}"`);
    }

    const confidence =
      typeof parsed["confidence"] === "number"
        ? Math.max(0, Math.min(1, parsed["confidence"]))
        : 0.8;

    const reasoning =
      typeof parsed["reasoning"] === "string" ? parsed["reasoning"] : undefined;

    return { kind: kind as RouteKind, confidence, reasoning };
  }
}
