/** Provider-neutral configuration: versions belong to callers or environment, never the runtime. */
export function configuredModel(explicit: string | undefined, variable: string): string {
  const model = explicit?.trim() || process.env[variable]?.trim();
  if (!model) throw new Error(`Model is required. Pass model in config or set ${variable}.`);
  return model;
}

export function configuredPricing(): Record<string, { input: number; output: number }> {
  const raw = process.env.MODEL_PRICING_JSON?.trim();
  if (!raw) return {};
  let prices: unknown;
  try { prices = JSON.parse(raw); } catch { throw new Error("MODEL_PRICING_JSON must be valid JSON."); }
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) throw new Error("MODEL_PRICING_JSON must be an object.");
  for (const price of Object.values(prices)) {
    if (!price || typeof price.input !== "number" || typeof price.output !== "number" || !Number.isFinite(price.input) || !Number.isFinite(price.output) || price.input < 0 || price.output < 0) {
      throw new Error("MODEL_PRICING_JSON prices must be finite non-negative numbers per million tokens.");
    }
  }
  return prices as Record<string, { input: number; output: number }>;
}
