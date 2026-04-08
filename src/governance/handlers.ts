import type { LLMResult } from "../schema/types";
import { BaseCallbackHandler } from "../callbacks/base";
import type { AuditLogger, BudgetController, ScopedBudgetController } from "./base";

function extractUsageAndModel(response: LLMResult): {
  inputTokens: number;
  outputTokens: number;
  model?: string;
} {
  const generationInfo = response.generations[0]?.[0]?.generationInfo ?? {};
  const usageCandidate =
    (response.llmOutput?.usage as Record<string, unknown> | undefined) ??
    (generationInfo.usage as Record<string, unknown> | undefined) ??
    {};

  return {
    inputTokens: Number(
      usageCandidate["input_tokens"] ?? usageCandidate["prompt_tokens"] ?? usageCandidate["inputTokens"] ?? 0
    ) || 0,
    outputTokens: Number(
      usageCandidate["output_tokens"] ?? usageCandidate["completion_tokens"] ?? usageCandidate["outputTokens"] ?? 0
    ) || 0,
    model:
      (generationInfo.model as string | undefined) ??
      (response.llmOutput?.model as string | undefined)
  };
}

export interface GovernanceBudgetHandlerConfig {
  budgetManager: BudgetController;
  auditLogger?: AuditLogger;
  scope?: string;
}

export class GovernanceBudgetHandler extends BaseCallbackHandler {
  private budgetManager: BudgetController;
  private auditLogger?: AuditLogger;
  private scope?: string;

  constructor(config: GovernanceBudgetHandlerConfig) {
    super();
    this.budgetManager = config.budgetManager;
    this.auditLogger = config.auditLogger;
    this.scope = config.scope;
  }

  private consume(name: string, amount: number) {
    const scopedManager = this.budgetManager as ScopedBudgetController;
    if (this.scope && typeof scopedManager.consumeScoped === "function") {
      return scopedManager.consumeScoped(this.scope, name, amount);
    }
    return this.budgetManager.consume(name, amount);
  }

  override async onLLMEnd(response: LLMResult, runId: string): Promise<void> {
    const { inputTokens, outputTokens, model } = extractUsageAndModel(response);
    const totals = [
      this.consume("input_tokens", inputTokens),
      this.consume("output_tokens", outputTokens),
      this.consume("total_tokens", inputTokens + outputTokens)
    ];

    const failure = totals.find((decision) => !decision.allowed);
    await this.auditLogger?.record({
      id: runId,
      timestamp: new Date().toISOString(),
      type: "budget.tokens",
      status: failure ? "warning" : "info",
      resourceType: "model",
      resourceId: model ?? "unknown",
      message: failure?.reason ?? `Recorded ${inputTokens + outputTokens} tokens.`,
      details: {
        model,
        inputTokens,
        outputTokens
      }
    });

    if (failure) {
      throw new Error(failure.reason);
    }
  }
}
