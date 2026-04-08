# Intent Routing

Intent routing classifies an input string into one of the built-in `RouteKind` categories and dispatches to the appropriate handler. Fireworks++ provides two routing strategies: a fast heuristic router based on regular expressions, and a smart router that falls back to LLM classification for ambiguous inputs.

## RouteKind

```typescript
type RouteKind = "llm" | "ssh" | "browser" | "research" | "document" | "editor" | "skill" | "calculator"
```

| Kind | Matches |
|------|---------|
| `llm` | General conversational queries (default fallback) |
| `ssh` | SSH/SFTP connections, remote server commands |
| `browser` | URL navigation, web scraping, page interaction |
| `research` | Wikipedia lookups, fact-finding, topic research |
| `document` | PDF/Word/HTML generation, drafting documents |
| `editor` | Opening files/directories in a code editor |
| `skill` | Named automation skill or workflow invocation |
| `calculator` | Arithmetic expressions, math computations |

## RouteDecision

```typescript
interface RouteDecision {
  kind: RouteKind
  confidence: number   // 0.0–1.0
  reasoning?: string   // Human-readable explanation
}
```

---

## HeuristicRouter

Pattern-matching based classification. Deterministic, instant, no LLM required. Uses a priority-ordered list of regular expression rules — the first matching rule wins.

```typescript
import { HeuristicRouter } from 'fireworks-plus-plus'

const router = new HeuristicRouter()

// Calculator
const r1 = router.route('What is 42 * 1000 + 7?')
console.log(r1.kind)       // "calculator"
console.log(r1.confidence) // 0.92
console.log(r1.reasoning)  // "Matched 1 heuristic pattern(s) for route 'calculator'."

// SSH
const r2 = router.route('SSH into deploy@192.168.1.100 and restart nginx')
console.log(r2.kind)       // "ssh"
console.log(r2.confidence) // 0.94  (multiple patterns matched, boosted)

// Browser
const r3 = router.route('Open https://github.com/anthropics/anthropic-sdk-python')
console.log(r3.kind)       // "browser"

// Research
const r4 = router.route('Tell me about the history of the Roman Empire')
console.log(r4.kind)       // "research"

// Document
const r5 = router.route('Create a PDF report summarising Q1 sales')
console.log(r5.kind)       // "document"

// Editor
const r6 = router.route('Open the file /src/index.ts in VSCode')
console.log(r6.kind)       // "editor"

// LLM fallback
const r7 = router.route('Hello, how are you?')
console.log(r7.kind)       // "llm"
console.log(r7.confidence) // 0.6
```

### Confidence Boosting

When multiple patterns from the same rule match, the confidence is boosted:

```
base confidence = 0.90
one extra pattern match = +0.04 (capped at +0.08 total boost)
```

### Rule Priority

Rules are evaluated in this order, highest priority first:
1. `calculator` (confidence 0.92)
2. `ssh` (confidence 0.90)
3. `browser` (confidence 0.88)
4. `editor` (confidence 0.87)
5. `document` (confidence 0.85)
6. `skill` (confidence 0.82)
7. `research` (confidence 0.75)
8. `llm` (fallback, confidence 0.60)

---

## IntentRouter

Combines `HeuristicRouter` with optional LLM fallback. If the heuristic confidence is below the `confidenceThreshold`, the LLM is asked to classify the intent.

```typescript
import { ChatAnthropic, IntentRouter } from 'fireworks-plus-plus'
import type { RouteDecision } from 'fireworks-plus-plus'

// Heuristic only (no LLM)
const fastRouter = new IntentRouter()

// Heuristic + LLM fallback
const smartRouter = new IntentRouter(
  new ChatAnthropic(),
  {
    confidenceThreshold: 0.75, // Use LLM when heuristic confidence < 0.75
    timeout: 10_000            // Timeout for LLM classification in milliseconds
  }
)

// route() is async (in case LLM is needed)
const decision: RouteDecision = await smartRouter.route('Help me draft a business proposal')
console.log(decision.kind)       // "document"
console.log(decision.confidence) // 0.85 or LLM-determined
console.log(decision.reasoning)  // Explanation from heuristic or LLM
```

### LLM Classification Prompt

When the heuristic is uncertain, `IntentRouter` sends this prompt to the LLM:

```
You are an intent classifier. Classify the following user input into EXACTLY ONE of these route kinds:
  - "llm"
  - "ssh"
  - "browser"
  - "research"
  - "document"
  - "editor"
  - "skill"
  - "calculator"

[definitions...]

User input:
"""<the input>"""

Respond with a JSON object and nothing else:
{
  "kind": "<one of the route kinds above>",
  "confidence": <float 0.0–1.0>,
  "reasoning": "<one short sentence>"
}
```

### Fallback Behaviour

If the LLM call fails for any reason (timeout, API error, parse error), `IntentRouter` falls back to the heuristic result with a note in `reasoning`.

```typescript
const decision = await smartRouter.route('some ambiguous input')
if (decision.reasoning?.includes('LLM classification failed')) {
  console.log('Using heuristic fallback')
}
```

### Config

```typescript
interface IntentRouterOptions {
  confidenceThreshold?: number  // Default: 0.7
  timeout?: number              // LLM timeout in milliseconds (default: 15_000)
}

new IntentRouter(
  llm?: BaseChatModel,         // Optional — if omitted, heuristic only
  options?: IntentRouterOptions
)
```

---

## RouterChain

Route incoming requests to different destination chains based on intent:

```typescript
import { RouterChain, MultiRouteChain, IntentRouter, LLMChain, PromptTemplate, ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const router = new IntentRouter(llm)

// Define a chain for each route kind you want to handle
const researchChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Research and provide factual information about: {input}')
)

const calcChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Solve this step by step: {input}')
)

const docChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Draft a professional document about: {input}')
)

const generalChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Answer helpfully: {input}')
)

// Destinations: map RouteKind → chain
const destinations = {
  research: researchChain,
  calculator: calcChain,
  document: docChain
  // any unmatched kinds use generalChain
}

const routerChain = new RouterChain(router, destinations, generalChain, { verbose: true })

// Single input → routed to the right chain automatically
const result = await routerChain.call({ input: 'What is the population of Tokyo?' })
console.log(result.output)      // Research result
console.log(result.destination) // "research"
```

### MultiRouteChain

Extends RouterChain with `confidence` and `reasoning` in the output:

```typescript
const multiChain = new MultiRouteChain(router, destinations, generalChain)

const result = await multiChain.call({ input: 'Calculate the area of a circle with radius 7' })
console.log(result.output)      // Calculated area
console.log(result.destination) // "calculator"
console.log(result.confidence)  // e.g. 0.92
console.log(result.reasoning)   // "Matched 2 heuristic pattern(s) for route 'calculator'."
```

---

## Standalone Routing

Use the router directly without chains:

```typescript
import { IntentRouter, CalculatorTool, ResearchTool, ChatAnthropic } from 'fireworks-plus-plus'

const router = new IntentRouter(new ChatAnthropic())
const calc = new CalculatorTool()
const research = new ResearchTool()
const llm = new ChatAnthropic()

async function dispatch(input: string): Promise<string> {
  const { kind, confidence } = await router.route(input)
  console.log(`Routing to: ${kind} (confidence: ${confidence.toFixed(2)})`)

  switch (kind) {
    case 'calculator':
      return calc.run(input)

    case 'research':
      return research.run(input)

    case 'llm':
    default:
      const reply = await llm.call([{ role: 'human', content: input }])
      return reply.content
  }
}

console.log(await dispatch('What is sqrt(256)?'))
// Routing to: calculator (confidence: 0.92)
// "16"

console.log(await dispatch('Who was Alan Turing?'))
// Routing to: research (confidence: 0.75)
// Wikipedia summary...
```

---

## Building a Full Dispatch Pipeline

```typescript
import {
  IntentRouter,
  RouterChain,
  SafetyPolicy,
  ChatAnthropic,
  LLMChain,
  PromptTemplate,
  CalculatorTool,
  ResearchTool
} from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const llm = new ChatAnthropic()
const router = new IntentRouter(llm)

// Build destination chains
const calcTool = new CalculatorTool()
const researchTool = new ResearchTool()

// Wrap tools in chains for the RouterChain
const calcChain = new LLMChain(llm, PromptTemplate.fromTemplate(
  'Calculate: {input}\nUse the format: [expression] = [result]'
))
const researchChain = new LLMChain(llm, PromptTemplate.fromTemplate(
  'Provide accurate factual information about: {input}'
))
const defaultChain = new LLMChain(llm, PromptTemplate.fromTemplate(
  'Answer this question helpfully and concisely: {input}'
))

const routerChain = new RouterChain(
  router,
  { calculator: calcChain, research: researchChain },
  defaultChain,
  { verbose: true }
)

async function handleUserInput(input: string): Promise<string> {
  // Safety check first
  const safetyResult = policy.check(input)
  if (!safetyResult.allowed) {
    return `Request blocked: ${safetyResult.reason}`
  }

  // Route and respond
  const result = await routerChain.call({ input })
  return String(result.output)
}

// Example usage
console.log(await handleUserInput('What is 15% of 340?'))
console.log(await handleUserInput('Tell me about quantum computing'))
console.log(await handleUserInput('What is the meaning of life?'))
```
