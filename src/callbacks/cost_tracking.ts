import type { LLMResult } from "../schema/types";
import { BaseCallbackHandler } from "./base";

export interface ModelPricing {
  input: number;
  output: number;
}

export interface CostTrackingHandlerOptions {
  pricing?: Record<string, ModelPricing>;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostSummary extends UsageSummary {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  byModel: Record<string, UsageSummary & { totalCost: number }>;
}

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 }
};

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

  const inputTokens = Number(
    usageCandidate["input_tokens"] ??
      usageCandidate["prompt_tokens"] ??
      usageCandidate["inputTokens"] ??
      0
  );

  const outputTokens = Number(
    usageCandidate["output_tokens"] ??
      usageCandidate["completion_tokens"] ??
      usageCandidate["outputTokens"] ??
      0
  );

  const model =
    (generationInfo.model as string | undefined) ??
    (response.llmOutput?.model as string | undefined);

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    model
  };
}

/**
 * CostTrackingHandler — tracks token usage and approximate cost by model.
 */
export class CostTrackingHandler extends BaseCallbackHandler {
  private pricing: Record<string, ModelPricing>;
  private byModel = new Map<string, UsageSummary>();

  constructor(options: CostTrackingHandlerOptions = {}) {
    super();
    this.pricing = options.pricing ?? DEFAULT_PRICING;
  }

  override async onLLMEnd(response: LLMResult, _runId: string): Promise<void> {
    const { inputTokens, outputTokens, model } = extractUsageAndModel(response);
    const modelKey = model ?? "unknown";
    const current = this.byModel.get(modelKey) ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };

    const updated: UsageSummary = {
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
      totalTokens: current.totalTokens + inputTokens + outputTokens
    };

    this.byModel.set(modelKey, updated);
  }

  reset(): void {
    this.byModel.clear();
  }

  getSummary(): CostSummary {
    const byModel: Record<string, UsageSummary & { totalCost: number }> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let inputCost = 0;
    let outputCost = 0;

    for (const [model, usage] of this.byModel.entries()) {
      const pricing = this.pricing[model] ?? { input: 0, output: 0 };
      const modelInputCost = (usage.inputTokens / 1_000_000) * pricing.input;
      const modelOutputCost = (usage.outputTokens / 1_000_000) * pricing.output;

      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      inputCost += modelInputCost;
      outputCost += modelOutputCost;

      byModel[model] = {
        ...usage,
        totalCost: modelInputCost + modelOutputCost
      };
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      byModel
    };
  }

  printSummary(): void {
    console.log("Cost summary:", this.getSummary());
  }
}
