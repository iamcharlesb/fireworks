// ============================================================
// Fireworks++ — HeuristicRouter
// Pattern-matching based intent routing — no LLM required.
// Routes to one of the RouteKind values based on input text.
// ============================================================

import type { RouteDecision, RouteKind } from "../schema/types";

interface RoutingRule {
  kind: RouteKind;
  patterns: RegExp[];
  /** Base confidence when this rule fires (0–1). */
  baseConfidence: number;
}

/**
 * HeuristicRouter classifies an input string into a RouteKind using
 * deterministic pattern matching.  Rules are evaluated in priority order;
 * the first match wins.
 */
export class HeuristicRouter {
  private rules: RoutingRule[] = [
    // ---- SSH / remote server access ----
    {
      kind: "ssh",
      patterns: [
        /\b(ssh|sftp|scp)\b/i,
        /\bconnect\s+to\b/i,
        /\b[\w.-]+@[\w.-]+\b/,                        // user@host pattern
        /\b(remote\s+server|remote\s+host|login\s+to\s+server)\b/i,
        /\b(run\s+on\s+server|execute\s+on\s+server|deploy\s+to\s+server)\b/i,
        /\b(hostname|port\s+22)\b/i
      ],
      baseConfidence: 0.9
    },
    // ---- Browser / web navigation ----
    {
      kind: "browser",
      patterns: [
        /\b(open|navigate|go\s+to|visit|browse\s+to)\b.*\b(url|site|page|website|web)\b/i,
        /\b(open|launch|start)\s+(browser|chrome|firefox|safari|edge)\b/i,
        /https?:\/\/[\w./?#&=%+-]+/i,                  // bare URL in input
        /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
        /\b(click|scroll|fill\s+in|submit\s+form|take\s+screenshot)\b/i,
        /\b(web\s+scrape|scrape\s+the\s+page|download\s+page)\b/i
      ],
      baseConfidence: 0.88
    },
    // ---- Calculator / math ----
    {
      kind: "calculator",
      patterns: [
        /\b(calculate|compute|evaluate|solve|what\s+is)\s+[\d(]/i,
        /^\s*[\d\s+\-*/^().]+\s*[=?]?\s*$/,            // pure arithmetic expression
        /\b(sum|product|quotient|remainder|modulo|factorial|square\s+root|sqrt)\b/i,
        /\b\d+\s*[+\-*/^%]\s*\d+\b/,                  // inline arithmetic
        /\bhow\s+(much|many)\s+is\s+[\d(]/i
      ],
      baseConfidence: 0.92
    },
    // ---- Document generation ----
    {
      kind: "document",
      patterns: [
        /\b(create|write|generate|make|produce)\s+(a\s+)?(doc|document|report|essay|pdf|spreadsheet|presentation|slide)\b/i,
        /\b(draft\s+a|compose\s+a)\b/i,
        /\b(export\s+to\s+pdf|save\s+as\s+pdf)\b/i,
        /\b(word\s+document|excel\s+sheet|google\s+doc)\b/i,
        /\b(write\s+up|write\s+a\s+summary|write\s+a\s+proposal)\b/i
      ],
      baseConfidence: 0.85
    },
    // ---- Editor (IDE / file editing) ----
    {
      kind: "editor",
      patterns: [
        /\b(open\s+in\s+vscode|open\s+in\s+vim|open\s+in\s+emacs|open\s+in\s+nano)\b/i,
        /\b(edit\s+file|open\s+file|edit\s+the\s+file)\b/i,
        /\b(open\s+editor|launch\s+editor|start\s+editor)\b/i,
        /\b(vscode|vs\s+code)\b/i,
        /\b(modify\s+file|change\s+file|update\s+file)\b/i
      ],
      baseConfidence: 0.87
    },
    // ---- Research ----
    {
      kind: "research",
      patterns: [
        /\b(research|investigate|look\s+into|study)\b/i,
        /\b(find\s+out|what\s+is|who\s+is|where\s+is|when\s+(did|was)|why\s+(did|is))\b/i,
        /\b(wikipedia|encyclop(ae|e)dia|search\s+for|look\s+up)\b/i,
        /\b(latest\s+(news|research|paper|study))\b/i,
        /\b(tell\s+me\s+about|explain|describe|summarize)\b/i,
        /\b(history\s+of|background\s+on|overview\s+of)\b/i
      ],
      baseConfidence: 0.75
    },
    // ---- Skill (named skill invocation) ----
    {
      kind: "skill",
      patterns: [
        /\b(use\s+skill|invoke\s+skill|run\s+skill|call\s+skill)\b/i,
        /\b(skill:|@skill)\b/i,
        /\b(automate|workflow|pipeline|orchestrate)\b/i
      ],
      baseConfidence: 0.82
    }
    // "llm" is the default fallback — no patterns needed
  ];

  /**
   * Route the input string to the most appropriate RouteKind.
   * Returns a RouteDecision with the kind and a confidence score.
   */
  route(input: string): RouteDecision {
    for (const rule of this.rules) {
      const matchedPatterns = rule.patterns.filter((p) => p.test(input));
      if (matchedPatterns.length === 0) continue;

      // Boost confidence if multiple patterns match
      const boost = Math.min((matchedPatterns.length - 1) * 0.04, 0.08);
      const confidence = Math.min(rule.baseConfidence + boost, 0.99);

      return {
        kind: rule.kind,
        confidence,
        reasoning: `Matched ${matchedPatterns.length} heuristic pattern(s) for route "${rule.kind}".`
      };
    }

    // Default: delegate to LLM for general conversational queries
    return {
      kind: "llm",
      confidence: 0.6,
      reasoning: "No specific heuristic patterns matched; defaulting to LLM route."
    };
  }
}
