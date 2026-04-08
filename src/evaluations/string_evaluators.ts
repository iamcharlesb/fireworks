import { BaseEvaluator, type EvaluationOutcome } from "./base";

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * ExactMatchEvaluator — exact string or JSON-stringified match after normalization.
 */
export class ExactMatchEvaluator extends BaseEvaluator<unknown, unknown> {
  name = "exact_match";

  async evaluate(actual: unknown, expected: unknown): Promise<EvaluationOutcome> {
    const actualText = normalize(typeof actual === "string" ? actual : JSON.stringify(actual));
    const expectedText = normalize(typeof expected === "string" ? expected : JSON.stringify(expected));
    const passed = actualText === expectedText;

    return {
      passed,
      score: passed ? 1 : 0,
      feedback: passed ? "Exact match." : `Expected ${expectedText} but received ${actualText}.`
    };
  }
}

/**
 * ContainsStringEvaluator — checks whether the normalized actual string contains the expected string.
 */
export class ContainsStringEvaluator extends BaseEvaluator<string, string> {
  name = "contains_string";

  async evaluate(actual: string, expected: string): Promise<EvaluationOutcome> {
    const actualText = normalize(actual);
    const expectedText = normalize(expected);
    const passed = actualText.includes(expectedText);

    return {
      passed,
      score: passed ? 1 : 0,
      feedback: passed ? "Expected substring found." : `Expected substring not found: ${expectedText}`
    };
  }
}
