# Callbacks

Callbacks give you visibility into every stage of the Fireworks++ execution pipeline. Attach them to LLMs, chains, or tools to receive events when execution starts, ends, errors, or produces a streaming token.

## CallbackHandler Interface

```typescript
interface CallbackHandler {
  onLLMStart?:    (llmName: string, prompts: string[], runId: string) => void | Promise<void>
  onLLMEnd?:      (response: LLMResult, runId: string) => void | Promise<void>
  onLLMError?:    (error: Error, runId: string) => void | Promise<void>
  onLLMNewToken?: (token: string, runId: string) => void | Promise<void>
  onChainStart?:  (chainName: string, inputs: ChainValues, runId: string) => void | Promise<void>
  onChainEnd?:    (outputs: ChainValues, runId: string) => void | Promise<void>
  onChainError?:  (error: Error, runId: string) => void | Promise<void>
  onToolStart?:   (toolName: string, input: string, runId: string) => void | Promise<void>
  onToolEnd?:     (output: string, runId: string) => void | Promise<void>
  onToolError?:   (error: Error, runId: string) => void | Promise<void>
  onAgentAction?: (action: AgentAction, runId: string) => void | Promise<void>
  onAgentFinish?: (finish: AgentFinish, runId: string) => void | Promise<void>
}
```

Each handler method is optional — implement only the events you care about.

---

## BaseCallbackHandler

A convenient abstract base class with no-op implementations of every method. Extend it and override only what you need:

```typescript
import { BaseCallbackHandler } from 'fireworks-plus-plus'
import type { LLMResult, ChainValues } from 'fireworks-plus-plus'

class MyCallbackHandler extends BaseCallbackHandler {
  private tokenCount = 0
  private chainStartTime = 0

  override async onLLMNewToken(token: string, _runId: string): Promise<void> {
    this.tokenCount++
    process.stdout.write(token)
  }

  override async onChainStart(chainName: string, _inputs: ChainValues, runId: string): Promise<void> {
    this.chainStartTime = Date.now()
    console.log(`\n[START] Chain: ${chainName}, ID: ${runId}`)
  }

  override async onChainEnd(_outputs: ChainValues, runId: string): Promise<void> {
    const elapsed = Date.now() - this.chainStartTime
    console.log(`\n[END] ${runId} completed in ${elapsed}ms, tokens: ${this.tokenCount}`)
    this.tokenCount = 0
  }

  override async onChainError(error: Error, runId: string): Promise<void> {
    console.error(`\n[ERROR] ${runId}: ${error.message}`)
  }
}

// Attach to an LLM or chain
const handler = new MyCallbackHandler()
const llm = new ChatAnthropic({ callbacks: [handler] })
```

---

## LoggingCallbackHandler

A production-ready callback handler that emits structured, timestamped log lines for all lifecycle events. Supports configurable log levels and a custom prefix.

```typescript
import { LoggingCallbackHandler } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({
  level: 'info',            // 'debug' | 'info' | 'warn'
  prefix: '[MyApp]'         // Prepended to every log line
})
```

### Log Levels

| Level | Events included |
|-------|----------------|
| `debug` | All events including `onLLMStart` and `onLLMNewToken` |
| `info` | LLM end, chain start/end, tool start/end, agent actions (default) |
| `warn` | Errors only |

### Sample Output

```
2026-04-02T10:15:01.234Z [MyApp] [CHAIN:START] chain="llm_chain" inputKeys=[topic] runId=abc123
2026-04-02T10:15:01.235Z [MyApp] [LLM:END]     generations=1 runId=abc123
2026-04-02T10:15:02.891Z [MyApp] [CHAIN:END]   outputKeys=[text] runId=abc123
```

### Attaching to a Chain

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, LoggingCallbackHandler } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'info' })

const llm = new ChatAnthropic({ callbacks: [logger] })
const chain = new LLMChain(llm, PromptTemplate.fromTemplate('{input}'), {
  callbacks: [logger]
})

await chain.run('Hello, world!')
// Logs chain start, LLM start/end, chain end
```

---

## StreamingCallbackHandler

Collects streaming tokens into a buffer and calls your `onToken` function for each token as it arrives. Use this when you want to display tokens to the user in real time.

```typescript
import { StreamingCallbackHandler, ChatAnthropic } from 'fireworks-plus-plus'

const handler = new StreamingCallbackHandler((token: string) => {
  process.stdout.write(token)
})

const llm = new ChatAnthropic({ callbacks: [handler] })

await llm.stream(
  [{ role: 'human', content: 'Write a haiku about rain.' }],
  async (chunk) => {
    if (chunk.isFinal) console.log('\n--- streaming complete ---')
  }
)

// After streaming, access the full accumulated text
console.log('Full response:', handler.getBuffer())

// Reset for the next streaming call
handler.reset()
```

### Methods

```typescript
class StreamingCallbackHandler extends BaseCallbackHandler {
  constructor(onToken: (token: string) => void)

  getBuffer(): string  // Full accumulated text so far
  reset(): void        // Clear the buffer for reuse
}
```

---

## TracingCallbackHandler

```typescript
import { TracingCallbackHandler } from 'fireworks-plus-plus'

const tracing = new TracingCallbackHandler()
```

---

`TracingCallbackHandler` records in-memory run trees with:

- Chain, tool, and LLM runs
- Parent-child relationships
- Start/end timestamps and durations
- Streamed token counts
- Agent actions and final outputs

### Common methods

```typescript
tracing.getRun(runId)
tracing.getRuns()
tracing.getRootRuns()
tracing.getSummary()
tracing.clear()
tracing.printSummary()
```

### Example

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, TracingCallbackHandler } from 'fireworks-plus-plus'

const tracing = new TracingCallbackHandler()
const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  callbacks: [tracing]
})

const chain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Answer briefly: {question}'),
  { callbacks: [tracing] }
)

await chain.run({ question: 'What is the capital of France?' })

console.log(tracing.getSummary())
console.log(tracing.getRootRuns())
```

---

## CostTrackingHandler

```typescript
import { CostTrackingHandler } from 'fireworks-plus-plus'

const costs = new CostTrackingHandler()
```

---

`CostTrackingHandler` tracks approximate input/output token usage and cost by model. It reads usage data from model responses and ships with a small default pricing table for common Anthropic and OpenAI models.

### Common methods

```typescript
costs.getSummary()
costs.reset()
costs.printSummary()
```

### Custom pricing

```typescript
import { CostTrackingHandler } from 'fireworks-plus-plus'

const costs = new CostTrackingHandler({
  pricing: {
    'my-model': { input: 1.2, output: 4.8 }
  }
})
```

## Attaching Callbacks

Callbacks can be attached at three levels, and all three fire on each execution:

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, LoggingCallbackHandler } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'debug' })

// 1. LLM level — fires for every LLM call this model makes
const llm = new ChatAnthropic({ callbacks: [logger] })

// 2. Chain level — fires for chain start/end AND passes down to child LLM calls
const chain = new LLMChain(llm, PromptTemplate.fromTemplate('{input}'), {
  callbacks: [logger]
})

// 3. Per-call level — fires only for this specific call
await chain.call({ input: 'Hello' }, [logger])
```

You can also use multiple handlers simultaneously:

```typescript
const chain = new LLMChain(llm, prompt, {
  callbacks: [
    new LoggingCallbackHandler({ level: 'info' }),
    new TracingCallbackHandler(),
    new CostTrackingHandler()
  ]
})
```
