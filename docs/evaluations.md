# Evaluations

Evaluations let you run a target function across a dataset and score the outputs with reusable evaluators. This is useful for prompt iteration, regression checks, and lightweight agent or RAG benchmarking.

---

## Core API

```typescript
import {
  ExactMatchEvaluator,
  ContainsStringEvaluator,
  runEvaluation
} from 'fireworks-plus-plus'
```

### Types

```typescript
interface EvaluationCase<TInput, TExpected> {
  id?: string
  input: TInput
  expected: TExpected
  metadata?: Record<string, unknown>
}

interface EvaluationOutcome {
  passed: boolean
  score: number
  feedback?: string
}

interface EvaluationSummary<TInput, TExpected, TActual> {
  total: number
  passed: number
  failed: number
  averageScore: number
  durationMs: number
  results: Array<EvaluationResult<TInput, TExpected, TActual>>
}
```

---

## `runEvaluation()`

Run a target function against a dataset:

```typescript
import { ExactMatchEvaluator, runEvaluation } from 'fireworks-plus-plus'

const summary = await runEvaluation({
  cases: [
    { id: 'france', input: 'France', expected: 'Paris' },
    { id: 'japan', input: 'Japan', expected: 'Tokyo' }
  ],
  target: async (country) => {
    const capitals: Record<string, string> = {
      France: 'Paris',
      Japan: 'Tokyo'
    }

    return capitals[country] ?? 'Unknown'
  },
  evaluator: new ExactMatchEvaluator()
})

console.log(summary.passed, '/', summary.total)
console.log(summary.averageScore)
```

### Config

```typescript
interface EvaluationRunConfig<TInput, TExpected, TActual> {
  cases: Array<EvaluationCase<TInput, TExpected>>
  target: (input: TInput) => Promise<TActual> | TActual
  evaluator:
    | BaseEvaluator<TActual, TExpected>
    | ((actual: TActual, expected: TExpected) => Promise<EvaluationOutcome> | EvaluationOutcome)
}
```

---

## Built-In Evaluators

### `ExactMatchEvaluator`

Normalizes whitespace and casing, then compares the full output.

```typescript
import { ExactMatchEvaluator } from 'fireworks-plus-plus'

const evaluator = new ExactMatchEvaluator()
const result = await evaluator.evaluate('Paris', 'paris')
console.log(result.passed) // true
```

### `ContainsStringEvaluator`

Checks whether the normalized actual string contains the expected string.

```typescript
import { ContainsStringEvaluator } from 'fireworks-plus-plus'

const evaluator = new ContainsStringEvaluator()
const result = await evaluator.evaluate(
  'Paris is the capital of France.',
  'capital of france'
)
console.log(result.passed) // true
```

---

## Custom Evaluators

Extend `BaseEvaluator` when you want reusable scoring logic:

```typescript
import { BaseEvaluator } from 'fireworks-plus-plus'

class LengthEvaluator extends BaseEvaluator<string, number> {
  name = 'length_match'

  async evaluate(actual: string, expected: number) {
    const delta = Math.abs(actual.length - expected)
    return {
      passed: delta === 0,
      score: Math.max(0, 1 - delta / Math.max(expected, 1)),
      feedback: `Length delta: ${delta}`
    }
  }
}
```

---

## Typical Uses

- Prompt regression tests
- Agent answer quality spot checks
- RAG answer benchmarking against expected snippets
- CI gates for high-value flows

For callback-based observability during those runs, pair this with [Callbacks](./callbacks.md).
