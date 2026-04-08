export interface EvaluationCase<TInput, TExpected> {
  id?: string;
  input: TInput;
  expected: TExpected;
  metadata?: Record<string, unknown>;
}

export interface EvaluationOutcome {
  passed: boolean;
  score: number;
  feedback?: string;
}

export interface EvaluationResult<TInput, TExpected, TActual> extends EvaluationOutcome {
  caseId: string;
  input: TInput;
  expected: TExpected;
  actual: TActual;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface EvaluationSummary<TInput, TExpected, TActual> {
  total: number;
  passed: number;
  failed: number;
  averageScore: number;
  durationMs: number;
  results: Array<EvaluationResult<TInput, TExpected, TActual>>;
}

/**
 * BaseEvaluator — evaluate an actual output against an expected output.
 */
export abstract class BaseEvaluator<TActual, TExpected> {
  abstract name: string;
  abstract evaluate(actual: TActual, expected: TExpected): Promise<EvaluationOutcome>;
}
