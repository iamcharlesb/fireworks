import {
  BaseEvaluator,
  type EvaluationCase,
  type EvaluationOutcome,
  type EvaluationResult,
  type EvaluationSummary
} from "./base";

export interface EvaluationRunConfig<TInput, TExpected, TActual> {
  cases: Array<EvaluationCase<TInput, TExpected>>;
  target: (input: TInput) => Promise<TActual> | TActual;
  evaluator:
    | BaseEvaluator<TActual, TExpected>
    | ((actual: TActual, expected: TExpected) => Promise<EvaluationOutcome> | EvaluationOutcome);
}

/**
 * runEvaluation — run a target function across a dataset and score the outputs.
 */
export async function runEvaluation<TInput, TExpected, TActual>(
  config: EvaluationRunConfig<TInput, TExpected, TActual>
): Promise<EvaluationSummary<TInput, TExpected, TActual>> {
  const startedAt = Date.now();
  const results: Array<EvaluationResult<TInput, TExpected, TActual>> = [];

  const evaluate = async (actual: TActual, expected: TExpected): Promise<EvaluationOutcome> => {
    if (config.evaluator instanceof BaseEvaluator) {
      return config.evaluator.evaluate(actual, expected);
    }
    return config.evaluator(actual, expected);
  };

  for (let index = 0; index < config.cases.length; index++) {
    const testCase = config.cases[index];
    const caseStartedAt = Date.now();
    const actual = await config.target(testCase.input);
    const outcome = await evaluate(actual, testCase.expected);

    results.push({
      caseId: testCase.id ?? `case_${index + 1}`,
      input: testCase.input,
      expected: testCase.expected,
      actual,
      passed: outcome.passed,
      score: outcome.score,
      feedback: outcome.feedback,
      durationMs: Date.now() - caseStartedAt,
      metadata: testCase.metadata
    });
  }

  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const failed = total - passed;
  const averageScore =
    total === 0 ? 0 : results.reduce((sum, result) => sum + result.score, 0) / total;

  return {
    total,
    passed,
    failed,
    averageScore,
    durationMs: Date.now() - startedAt,
    results
  };
}
