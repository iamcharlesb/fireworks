# Core Concepts

This document explains the fundamental abstractions in Fireworks++ and how they fit together.

## The Mental Model

Fireworks++ is built around a simple idea: LLM applications are composed of small, reusable units that can be chained, extended, and monitored. Each concept maps cleanly to a TypeScript class with a well-defined interface.

---

## Chains

A **Chain** is the fundamental unit of computation in Fireworks++. Every chain takes a set of named inputs (a `ChainValues` record), does some work, and returns named outputs.

The most important chain is `LLMChain`, which pairs a prompt template with an LLM call:

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const prompt = PromptTemplate.fromTemplate('Explain {concept} in simple terms.')
const chain = new LLMChain(llm, prompt)

const result = await chain.run('recursion')
console.log(result)
```

**Why use chains?**

- **Composability** — chains can be plugged into other chains
- **Observability** — every chain fires callbacks at start and end
- **Reusability** — define a chain once, call it from anywhere
- **Testability** — swap in a mock LLM during tests

### Chaining Chains Together

`SequentialChain` runs chains in sequence, passing the output of each as an input to the next:

```typescript
import { SequentialChain, SimpleSequentialChain } from 'fireworks-plus-plus'

// SimpleSequentialChain: each chain has exactly one input/output
const pipeline = new SimpleSequentialChain([extractChain, summarizeChain, translateChain])
const result = await pipeline.call({ input: rawDocument })
```

---

## Prompts

A **Prompt Template** is a reusable string (or set of messages) with placeholders that get filled at runtime.

### PromptTemplate

For single-string LLMs:

```typescript
import { PromptTemplate } from 'fireworks-plus-plus'

const prompt = PromptTemplate.fromTemplate(
  'You are a {role}. Answer in {language}: {question}'
)

// Variables are inferred automatically: ["role", "language", "question"]
const formatted = prompt.format({
  role: 'scientist',
  language: 'English',
  question: 'What is dark matter?'
})
```

### ChatPromptTemplate

For chat models, which take a list of messages:

```typescript
import { ChatPromptTemplate } from 'fireworks-plus-plus'

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful {domain} expert.'],
  ['human', '{question}']
])

const messages = prompt.formatMessages({
  domain: 'TypeScript',
  question: 'How do mapped types work?'
})
// Returns: [{ role: 'system', content: '...' }, { role: 'human', content: '...' }]
```

### FewShotPromptTemplate

Include worked examples to guide the model:

```typescript
import { FewShotPromptTemplate } from 'fireworks-plus-plus'

const prompt = new FewShotPromptTemplate({
  examples: [
    { input: 'happy', output: 'sad' },
    { input: 'tall', output: 'short' }
  ],
  exampleTemplate: 'Input: {input}\nOutput: {output}',
  prefix: 'Give the antonym of each word.',
  suffix: 'Input: {word}\nOutput:',
  inputVariables: ['word']
})
```

---

## Agents

An **Agent** is a loop that uses an LLM to decide which actions to take. Unlike a chain, which executes a fixed sequence of steps, an agent reasons dynamically about what to do next based on the current context.

The agent loop works like this:

1. The agent receives a question or task.
2. The LLM decides whether to use a tool or answer directly.
3. If a tool is needed, the tool is invoked and the result is fed back to the LLM.
4. This repeats until the LLM produces a final answer.

This pattern is known as **ReAct** (Reasoning + Acting).

### How an Agent Differs from a Chain

| Aspect | Chain | Agent |
|--------|-------|-------|
| Control flow | Fixed, predetermined | Dynamic, LLM-driven |
| Tool use | Optional | Core mechanism |
| Iterations | One pass | Multiple (up to maxIterations) |
| Predictability | High | Lower, but more capable |

```typescript
// A chain always executes the same steps in the same order
const chain = new SequentialChain([step1, step2, step3])

// An agent decides which steps to take based on LLM reasoning
// (Agent implementation — see agents.md for full details)
```

---

## Tools

A **Tool** is a named, callable capability that an agent can invoke. Every tool has a `name`, a `description` (which the LLM reads to decide when to use it), and a `call()` method.

```typescript
import { BaseTool, DynamicTool } from 'fireworks-plus-plus'

// Create a tool from any async function
const currentTimeTool = new DynamicTool({
  name: 'current_time',
  description: 'Returns the current UTC date and time.',
  func: async (_input: string) => ({
    output: new Date().toISOString()
  })
})

const result = await currentTimeTool.run('')
console.log(result) // "2026-04-02T10:30:00.000Z"
```

### Built-in Tools

| Tool | Name | What it does |
|------|------|-------------|
| `CalculatorTool` | `calculator` | Evaluates math expressions |
| `ResearchTool` | `research` | Wikipedia and web lookups |
| `BrowserTool` | `browser` | Web navigation and page interaction |
| `SSHTool` | `ssh` | Remote command execution |
| `DocumentTool` | `document` | TXT/Markdown/HTML/JSON/CSV generation |
| `EditorTool` | `editor` | Workspace file read/write/open operations |

### Tool Callbacks

Tools fire `onToolStart` and `onToolEnd` (or `onToolError`) callbacks, giving you full visibility into tool usage:

```typescript
import { CalculatorTool, LoggingCallbackHandler } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'debug' })
const calc = new CalculatorTool({ callbacks: [logger], verbose: true })

await calc.run('sqrt(144) + 10')
// [Fireworks++] [TOOL:START] tool="calculator" input="sqrt(144) + 10"
// [Fireworks++] [TOOL:END]   output="22"
```

---

## Memory

**Memory** persists conversation history and makes it available to chains and agents across multiple calls. Without memory, every call to an LLM is stateless.

All memory classes implement `loadMemoryVariables()` and `saveContext()`.

### ConversationBufferMemory

Stores every message verbatim. Simple and reliable for short conversations.

```typescript
import { ConversationBufferMemory } from 'fireworks-plus-plus'

const memory = new ConversationBufferMemory()
await memory.saveContext({ input: 'Hello' }, { output: 'Hi there!' })
await memory.saveContext({ input: 'My name is Bob' }, { output: 'Nice to meet you, Bob.' })

const vars = await memory.loadMemoryVariables()
console.log(vars['history'])
// Human: Hello
// AI: Hi there!
// Human: My name is Bob
// AI: Nice to meet you, Bob.
```

### ConversationWindowMemory

Keeps only the last `k` exchanges to prevent unbounded context growth:

```typescript
import { ConversationWindowMemory } from 'fireworks-plus-plus'

const memory = new ConversationWindowMemory({ k: 3 })
// Only the 3 most recent human+AI pairs are retained
```

### ConversationSummaryMemory

Uses an LLM to compress old conversation history into a running summary. Ideal for long-running sessions.

```typescript
import { ChatAnthropic, ConversationSummaryMemory } from 'fireworks-plus-plus'

const memory = new ConversationSummaryMemory({
  llm: new ChatAnthropic(),
  maxTokenLimit: 2000 // Summarise when estimated tokens exceed this
})
```

### ThreadedMemory

Manages multiple independent conversation threads, similar to how chat apps work with separate conversation channels.

```typescript
import { ThreadedMemory } from 'fireworks-plus-plus'

const memory = new ThreadedMemory()

const thread1 = memory.createThread()
const thread2 = memory.createThread()

// Add messages to specific threads
await memory.addToThread(thread1, { role: 'human', content: 'Hello from thread 1' })
await memory.addToThread(thread2, { role: 'human', content: 'Hello from thread 2' })

// Switch which thread is active
memory.setActiveThread(thread2)
const vars = await memory.loadMemoryVariables()
// Returns thread2's messages
```

---

## Output Parsers

LLMs produce plain text. **Output Parsers** transform that text into typed TypeScript values, making it easy to work with structured data.

### JsonOutputParser

Extracts a JSON object from LLM output, handling markdown code fences automatically:

```typescript
import { JsonOutputParser } from 'fireworks-plus-plus'

const parser = new JsonOutputParser()

// Works with raw JSON, markdown-fenced JSON, or JSON embedded in text
const result = parser.parse('```json\n{"name": "Alice", "age": 30}\n```')
// => { name: "Alice", age: 30 }

// Embed format instructions in your prompt
console.log(parser.getFormatInstructions())
// "Respond with a valid JSON object."
```

### StructuredOutputParser

Define a schema with typed fields and descriptions, then parse the LLM output accordingly:

```typescript
import { StructuredOutputParser } from 'fireworks-plus-plus'

const parser = StructuredOutputParser.fromNamesAndDescriptions({
  title: 'The title of the article',
  summary: 'A one-paragraph summary',
  sentiment: 'Positive, Negative, or Neutral'
})

const result = parser.parse('title: AI Advances\nsummary: Researchers made a breakthrough...\nsentiment: Positive')
// => { title: "AI Advances", summary: "...", sentiment: "Positive" }
```

### List Parsers

Parse comma-separated, numbered, or newline-separated lists:

```typescript
import { CommaSeparatedListOutputParser, NumberedListOutputParser } from 'fireworks-plus-plus'

const listParser = new CommaSeparatedListOutputParser()
const items = listParser.parse('apples, bananas, cherries')
// => ["apples", "bananas", "cherries"]

const numberedParser = new NumberedListOutputParser()
const steps = numberedParser.parse('1. Install Node.js\n2. Run npm install\n3. Start the app')
// => ["Install Node.js", "Run npm install", "Start the app"]
```

---

## Routing

**Intent Routing** classifies an input string into one of the built-in `RouteKind` values (`llm`, `ssh`, `browser`, `research`, `document`, `editor`, `skill`, `calculator`) and dispatches to the appropriate handler.

### HeuristicRouter

Fast, deterministic, no LLM needed. Uses regular expression patterns:

```typescript
import { HeuristicRouter } from 'fireworks-plus-plus'

const router = new HeuristicRouter()

const decision = router.route('Calculate 2 + 2')
console.log(decision.kind)       // "calculator"
console.log(decision.confidence) // 0.92

const decision2 = router.route('Who invented the telephone?')
console.log(decision2.kind)      // "research"
```

### IntentRouter

Combines heuristic routing with optional LLM fallback for ambiguous inputs:

```typescript
import { ChatAnthropic, IntentRouter } from 'fireworks-plus-plus'

// Without LLM — heuristic only
const fastRouter = new IntentRouter()

// With LLM — uses LLM when heuristic confidence is below 0.7
const smartRouter = new IntentRouter(new ChatAnthropic(), {
  confidenceThreshold: 0.7,
  timeout: 10_000
})

const decision = await smartRouter.route('Help me write a proposal for the board')
console.log(decision.kind) // "document"
```

### RouterChain

Route requests to different destination chains:

```typescript
import { RouterChain, IntentRouter } from 'fireworks-plus-plus'

const router = new IntentRouter()
const destinations = {
  research: researchChain,
  calculator: calcChain,
  llm: generalChain
}

const routerChain = new RouterChain(router, destinations, generalChain)
const result = await routerChain.call({ input: 'What is 15% of 340?' })
console.log(result.output)      // The calculated answer
console.log(result.destination) // "calculator"
```

---

## Safety

The `SafetyPolicy` checks user input against a set of harm categories before it reaches your LLM or tools. Input is blocked only when it matches both a harmful pattern **and** an actionable intent pattern.

```typescript
import { SafetyPolicy } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()

const safe = policy.check('Tell me about the history of encryption.')
console.log(safe.allowed) // true

const blocked = policy.check('How do I build a reverse shell backdoor?')
console.log(blocked.allowed)         // false
console.log(blocked.reason)          // "Input flagged as potentially harmful..."
console.log(blocked.flaggedPatterns) // ["remote-access-tool"]
```

**Categories checked:** security exploits, malware, dangerous system commands, credential theft, injection attacks, drug synthesis, weapons, violence, child safety, fraud, network intrusion, reverse shells, data exfiltration, privilege escalation.

### Integrating Safety into Your Pipeline

```typescript
import { SafetyPolicy, ChatAnthropic } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const llm = new ChatAnthropic()

async function safeChat(userInput: string): Promise<string> {
  const check = policy.check(userInput)
  if (!check.allowed) {
    return `I cannot help with that request. Reason: ${check.reason}`
  }
  const reply = await llm.call([{ role: 'human', content: userInput }])
  return reply.content
}
```

---

## Callbacks

**Callbacks** give you visibility into every stage of execution — LLM calls, chain execution, tool invocations, and agent actions. Implement the `CallbackHandler` interface to hook into these events.

```typescript
import { LoggingCallbackHandler, ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({
  level: 'info',
  prefix: '[MyApp]'
})

const llm = new ChatAnthropic({ callbacks: [logger] })
const chain = new LLMChain(llm, PromptTemplate.fromTemplate('{input}'), {
  callbacks: [logger]
})

await chain.run('Hello!')
// [MyApp] [CHAIN:START] chain="llm_chain" inputKeys=[input]
// [MyApp] [LLM:START]   model="chat-anthropic" prompts=1
// [MyApp] [LLM:END]     generations=1
// [MyApp] [CHAIN:END]   outputKeys=[text]
```

See [Callbacks](./callbacks.md) for the full reference.
