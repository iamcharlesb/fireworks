# Chains

Chains are the composable processing units of Fireworks++. Every chain takes named inputs, performs some computation (usually involving an LLM), and returns named outputs. Chains can be combined, nested, and monitored through callbacks.

## BaseChain

All chains extend `BaseChain`, which provides:

- `call(inputs, callbacks?)` — run the chain, fire callbacks, return outputs
- `run(input)` — convenience shortcut for single-input/output chains
- `verbose` — enable console logging of intermediate steps
- `callbacks` — array of `CallbackHandler` to attach at chain construction time

The method you must implement when creating a custom chain is `_call(inputs)`.

---

## LLMChain

The fundamental chain: combines a **prompt template** with an **LLM** and an optional **output parser**.

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const prompt = PromptTemplate.fromTemplate('What is the capital of {country}?')
const chain = new LLMChain(llm, prompt)

// Single-variable shortcut
const answer = await chain.run('Japan')
console.log(answer) // "The capital of Japan is Tokyo."

// Multi-variable
const prompt2 = PromptTemplate.fromTemplate('Translate "{phrase}" into {language}.')
const transChain = new LLMChain(llm, prompt2)
const result = await transChain.run({ phrase: 'Good morning', language: 'French' })
console.log(result) // "Bonjour"
```

### LLMChain with Output Parser

Attach a parser to automatically transform the LLM's text output:

```typescript
import { JsonOutputParser } from 'fireworks-plus-plus'

const parser = new JsonOutputParser()
const prompt = PromptTemplate.fromTemplate(
  'Return information about {country} as JSON with fields: name, capital, population.\n' +
  parser.getFormatInstructions()
)

const chain = new LLMChain(llm, prompt, { outputParser: parser })
const data = await chain.run('Germany')
// data is a parsed object: { name: "Germany", capital: "Berlin", population: "~84 million" }
console.log(data.capital) // "Berlin"
```

### LLMChain with ChatPromptTemplate

Use a `ChatPromptTemplate` for system messages:

```typescript
import { ChatPromptTemplate } from 'fireworks-plus-plus'

const chatPrompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are an expert {domain} tutor. Be encouraging.'],
  ['human', 'Explain {concept} to a beginner.']
])

const chain = new LLMChain(llm, chatPrompt)
const lesson = await chain.run({ domain: 'mathematics', concept: 'derivatives' })
```

### Config

```typescript
interface LLMChainConfig {
  outputKey?: string        // Default: "text" — key used in the returned ChainValues
  outputParser?: BaseOutputParser<unknown>
  callbacks?: CallbackHandler[]
  verbose?: boolean
}
```

### Methods

```typescript
run(input: string | Record<string, string>): Promise<string>
predict(inputs: Record<string, string>): Promise<string>
call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues>
```

---

## SequentialChain

Runs a list of chains in order. The output of each chain is merged into the accumulated values and made available to subsequent chains as inputs.

```typescript
import { SequentialChain, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

// Step 1: extract key points
const extractPrompt = PromptTemplate.fromTemplate(
  'Extract 3 key points from this article:\n\n{article}'
)
const extractChain = new LLMChain(llm, extractPrompt, { outputKey: 'keyPoints' })

// Step 2: write a tweet from the key points
const tweetPrompt = PromptTemplate.fromTemplate(
  'Turn these key points into a tweet under 280 characters:\n\n{keyPoints}'
)
const tweetChain = new LLMChain(llm, tweetPrompt, { outputKey: 'tweet' })

// Declare: input variables, output variables
const seq = new SequentialChain(
  [extractChain, tweetChain],
  ['article'],  // inputs to the whole pipeline
  ['tweet'],    // outputs from the whole pipeline
  { verbose: true }
)

const result = await seq.call({ article: longNewsArticle })
console.log(result['tweet'])
```

### Config

```typescript
interface SequentialChainConfig {
  returnAll?: boolean       // Return all intermediate values, not just declared outputs
  callbacks?: CallbackHandler[]
  verbose?: boolean
}
```

### SimpleSequentialChain

When each chain has exactly one input and one output, use `SimpleSequentialChain` for brevity:

```typescript
import { SimpleSequentialChain } from 'fireworks-plus-plus'

const pipeline = new SimpleSequentialChain([
  summarizeChain,  // takes "input", produces "output"
  translateChain,  // takes "input", produces "output"
  tweetChain       // takes "input", produces "output"
])

// Pass initial input, get final output
const tweet = await pipeline.call({ input: originalText })
console.log(tweet.output)
```

---

## RouterChain

Routes an input to one of several destination chains based on intent classification. Uses an `IntentRouter` to determine which chain should handle the request.

```typescript
import { RouterChain, IntentRouter, LLMChain, PromptTemplate, ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const router = new IntentRouter()

// Define destination chains
const researchChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Research and summarise: {input}')
)
const calcChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Solve this math problem step by step: {input}')
)
const generalChain = new LLMChain(
  llm,
  PromptTemplate.fromTemplate('Answer this question helpfully: {input}')
)

const destinations = {
  research: researchChain,
  calculator: calcChain
  // any unmatched kind falls through to defaultChain
}

const routerChain = new RouterChain(router, destinations, generalChain, { verbose: true })

const result = await routerChain.call({ input: 'What is the speed of light in km/s?' })
console.log(result.output)      // The answer
console.log(result.destination) // "research"
```

### RouterChain Outputs

| Key | Type | Description |
|-----|------|-------------|
| `output` | `string` | The chain's response |
| `destination` | `RouteKind` | Which chain handled the request |

### MultiRouteChain

Same as `RouterChain` but also exposes `confidence` and `reasoning` in the output:

```typescript
import { MultiRouteChain } from 'fireworks-plus-plus'

const chain = new MultiRouteChain(router, destinations, generalChain)
const result = await chain.call({ input: 'SSH into my server at 192.168.1.100' })

console.log(result.destination) // "ssh"
console.log(result.confidence)  // 0.9
console.log(result.reasoning)   // "Matched 2 heuristic pattern(s) for route 'ssh'."
```

---

## RetrievalQAChain

`RetrievalQAChain` is a simple retrieval-augmented generation chain: it fetches relevant documents from a retriever, formats them into context, and prompts the model to answer using only that context.

```typescript
import {
  ChatAnthropic,
  InMemoryVectorStore,
  FakeEmbeddings,
  RetrievalQAChain,
  VectorStoreRetriever
} from 'fireworks-plus-plus'

const docs = [
  { pageContent: 'Bananas are yellow fruits.', metadata: { topic: 'fruit' } },
  { pageContent: 'TypeScript is a typed superset of JavaScript.', metadata: { topic: 'tech' } }
]

const store = await InMemoryVectorStore.fromDocuments(docs, new FakeEmbeddings(128))
const retriever = new VectorStoreRetriever(store, { k: 2 })

const qaChain = new RetrievalQAChain(new ChatAnthropic(), retriever, {
  returnSourceDocuments: true
})

const result = await qaChain.call({ query: 'What color are bananas?' })
console.log(result.text)
console.log(result.sourceDocuments)
```

### RetrievalQAChain Config

```typescript
interface RetrievalQAChainConfig {
  inputKey?: string               // Default: "query"
  outputKey?: string              // Default: "text"
  returnSourceDocuments?: boolean // Default: false
  prompt?: BasePromptTemplate
  callbacks?: CallbackHandler[]
  verbose?: boolean
}
```

### RetrievalQAChain Outputs

| Key | Type | Description |
|-----|------|-------------|
| `text` | `string` | The model answer |
| `sourceDocuments` | `Document[]` | Included only when `returnSourceDocuments` is enabled |

---

## TransformChain

Applies a pure TypeScript transformation function to chain values — no LLM call. Useful for data preprocessing, postprocessing, and formatting between chain steps.

```typescript
import { TransformChain } from 'fireworks-plus-plus'

// Uppercase the "text" field, output as "upperText"
const uppercaseTransform = new TransformChain({
  inputVariables: ['text'],
  outputVariables: ['upperText'],
  transform: (inputs) => ({
    upperText: String(inputs['text'] ?? '').toUpperCase()
  })
})

const result = await uppercaseTransform.call({ text: 'hello world' })
console.log(result.upperText) // "HELLO WORLD"
```

### Async Transform

The transform function can be async:

```typescript
const fetchMetadata = new TransformChain({
  inputVariables: ['url'],
  outputVariables: ['title', 'description'],
  transform: async (inputs) => {
    const response = await fetch(String(inputs['url']))
    const html = await response.text()
    const title = html.match(/<title>(.*?)<\/title>/i)?.[1] ?? 'Unknown'
    return { title, description: `Page fetched from ${inputs['url']}` }
  }
})
```

### Using TransformChain in a Pipeline

```typescript
const pipeline = new SequentialChain(
  [fetchMetadata, summarizeChain],
  ['url'],
  ['text'],
  { returnAll: false }
)
```

---

## Building Custom Chains

Extend `BaseChain` to create your own chain:

```typescript
import { BaseChain, type BaseChainConfig } from 'fireworks-plus-plus'
import type { ChainValues } from 'fireworks-plus-plus'

export class MyCustomChain extends BaseChain {
  inputKeys = ['userQuery']
  outputKeys = ['answer', 'sources']

  constructor(
    private apiClient: MyApiClient,
    config: BaseChainConfig = {}
  ) {
    super(config)
  }

  _chainType(): string {
    return 'my_custom_chain'
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const query = String(inputs['userQuery'] ?? '')

    if (this.verbose) {
      console.log(`[MyCustomChain] Querying: ${query}`)
    }

    const response = await this.apiClient.search(query)

    return {
      answer: response.topResult,
      sources: response.sources.join(', ')
    }
  }
}

// Usage
const chain = new MyCustomChain(apiClient, { verbose: true })
const result = await chain.call({ userQuery: 'What is quantum entanglement?' })
console.log(result.answer)
console.log(result.sources)
```

### Chain Callbacks

Chains fire four lifecycle events:

| Event | Fired when |
|-------|-----------|
| `onChainStart` | Before `_call()` executes |
| `onChainEnd` | After `_call()` returns successfully |
| `onChainError` | If `_call()` throws an error |

```typescript
import { LoggingCallbackHandler } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'debug' })
const chain = new LLMChain(llm, prompt, { callbacks: [logger] })

// Logs are emitted automatically:
// [Fireworks++] [CHAIN:START] chain="llm_chain" ...
// [Fireworks++] [CHAIN:END]   outputKeys=[text]
```
