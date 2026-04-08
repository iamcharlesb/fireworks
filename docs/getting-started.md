# Getting Started with Fireworks++

This guide walks you through installing Fireworks++, configuring your API keys, and building your first LLM-powered application step by step.

## Prerequisites

- Node.js 18 or later
- npm or yarn
- An Anthropic, OpenAI, or Perplexity API key (or a local Ollama installation)

## Installation

```bash
npm install fireworks-plus-plus
```

Fireworks++ has zero required runtime dependencies. The only peer dependencies are the optional official SDK packages for Anthropic and OpenAI, and even those are not needed — Fireworks++ calls the provider APIs directly using the built-in `fetch`.

## Setting Up API Keys

The recommended approach is to use environment variables so keys never appear in code.

```bash
# For Anthropic Claude
export ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
export OPENAI_API_KEY=sk-...

# For Perplexity
export PERPLEXITY_API_KEY=pplx-...
```

You can also pass the key directly in the constructor config for quick prototyping:

```typescript
const llm = new ChatAnthropic({ apiKey: 'sk-ant-...' })
```

For production applications, always use environment variables or a secrets manager.

## Step 1: Your First Chat Completion

The simplest use of Fireworks++ is calling a chat model directly.

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

async function main() {
  const llm = new ChatAnthropic({
    // Reads ANTHROPIC_API_KEY from environment if apiKey is omitted
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 1024
  })

  const reply = await llm.call([
    { role: 'system', content: 'You are a concise assistant.' },
    { role: 'human', content: 'What is TypeScript?' }
  ])

  console.log(reply.content)
  // "TypeScript is a statically typed superset of JavaScript..."
}

main().catch(console.error)
```

### Multi-turn Conversation

To have a multi-turn conversation, build up the message array manually:

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'
import type { Message } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

const conversation: Message[] = []

async function chat(userInput: string): Promise<string> {
  conversation.push({ role: 'human', content: userInput })
  const reply = await llm.call(conversation)
  conversation.push({ role: 'ai', content: reply.content })
  return reply.content
}

console.log(await chat('My name is Alice.'))
console.log(await chat('What is my name?'))
// "Your name is Alice."
```

## Step 2: Building Your First Chain

Chains combine a prompt template with an LLM. The `LLMChain` is the fundamental building block.

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

async function main() {
  const llm = new ChatAnthropic()

  // PromptTemplate.fromTemplate() auto-detects {variable} placeholders
  const prompt = PromptTemplate.fromTemplate(
    'You are a helpful assistant. Answer this question concisely: {question}'
  )

  const chain = new LLMChain(llm, prompt)

  // Pass a single string when there is one input variable
  const answer = await chain.run('What is the difference between null and undefined in JavaScript?')
  console.log(answer)

  // Or pass an object for multiple variables
  const prompt2 = PromptTemplate.fromTemplate(
    'Translate "{text}" from {source_language} to {target_language}.'
  )
  const translateChain = new LLMChain(llm, prompt2)
  const translation = await translateChain.run({
    text: 'Hello, world!',
    source_language: 'English',
    target_language: 'Spanish'
  })
  console.log(translation)
}

main().catch(console.error)
```

### Sequential Chains

Chain multiple LLMChains together so the output of one feeds the input of the next.

```typescript
import { ChatAnthropic, LLMChain, SimpleSequentialChain, PromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

const summarizePrompt = PromptTemplate.fromTemplate(
  'Summarize this text in one sentence: {input}'
)
const tweetPrompt = PromptTemplate.fromTemplate(
  'Turn this summary into a tweet under 280 characters: {input}'
)

const summarizeChain = new LLMChain(llm, summarizePrompt)
const tweetChain = new LLMChain(llm, tweetPrompt)

// SimpleSequentialChain passes each chain's output as the next chain's input
const pipeline = new SimpleSequentialChain([summarizeChain, tweetChain])
const tweet = await pipeline.call({ input: longArticleText })
console.log(tweet.output)
```

## Step 3: Using Chat Prompt Templates

`ChatPromptTemplate` produces structured message arrays for chat models, including system messages.

```typescript
import { ChatAnthropic, LLMChain, ChatPromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are an expert {domain} consultant. Be professional and concise.'],
  ['human', '{question}']
])

const chain = new LLMChain(llm, prompt)

const result = await chain.run({
  domain: 'TypeScript',
  question: 'What are the best practices for handling async errors?'
})
console.log(result)
```

## Step 4: Adding Memory to a Chat

Memory persists conversation context across calls.

```typescript
import { ChatAnthropic, LLMChain, ChatPromptTemplate, ConversationBufferMemory } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const memory = new ConversationBufferMemory({ memoryKey: 'history' })

async function chat(userInput: string): Promise<string> {
  // Load existing conversation history
  const memVars = await memory.loadMemoryVariables()
  const history = memVars['history'] as string

  const messages = []
  if (history) {
    messages.push({
      role: 'system' as const,
      content: `Previous conversation:\n${history}`
    })
  }
  messages.push({ role: 'human' as const, content: userInput })

  const reply = await llm.call(messages)

  // Save the new exchange to memory
  await memory.saveContext({ input: userInput }, { output: reply.content })

  return reply.content
}

// Each call builds on the previous context
await chat('My favourite programming language is TypeScript.')
await chat('I work at a startup building AI tools.')
const summary = await chat('Summarise what you know about me.')
console.log(summary)
```

### Windowed Memory

For long conversations, use windowed memory to keep only the most recent exchanges:

```typescript
import { ConversationWindowMemory } from 'fireworks-plus-plus'

// Only keeps the last 5 human+AI exchanges (10 messages total)
const memory = new ConversationWindowMemory({ k: 5 })
```

## Step 5: Creating a Tool

Tools let agents interact with the world. Use `DynamicTool` to wrap any function:

```typescript
import { DynamicTool, CalculatorTool, ResearchTool } from 'fireworks-plus-plus'

// Wrap your own function
const weatherTool = new DynamicTool({
  name: 'get_weather',
  description: 'Get the current weather for a city. Input: city name.',
  func: async (city: string) => {
    // In a real app, call a weather API here
    return { output: `The weather in ${city} is sunny and 22°C.` }
  }
})

const result = await weatherTool.run('London')
console.log(result) // "The weather in London is sunny and 22°C."

// Built-in tools
const calc = new CalculatorTool()
console.log(await calc.run('(2 + 3) * 4 / 2')) // "10"

const research = new ResearchTool({ maxResults: 2 })
console.log(await research.run('Eiffel Tower'))
```

## Step 6: Loading Documents for RAG

Load text files, embed them, and use a retriever for semantic retrieval.

```typescript
import { TextLoader, InMemoryVectorStore, FakeEmbeddings, VectorStoreRetriever } from 'fireworks-plus-plus'

async function buildKnowledgeBase(filePaths: string[]) {
  const allDocs = []

  for (const filePath of filePaths) {
    const loader = new TextLoader(filePath)
    const docs = await loader.load()
    allDocs.push(...docs)
  }

  // FakeEmbeddings is deterministic and great for development/testing.
  // Replace with a real embeddings provider for production.
  const embeddings = new FakeEmbeddings(128)
  const store = await InMemoryVectorStore.fromDocuments(allDocs, embeddings)

  return store
}

async function main() {
  const store = await buildKnowledgeBase(['./docs/faq.txt', './docs/guide.txt'])
  const retriever = new VectorStoreRetriever(store, { k: 3 })

  // Retrieve the 3 most relevant chunks
  const results = await retriever.getRelevantDocuments('How do I reset my password?')

  for (const doc of results) {
    console.log('---')
    console.log(doc.pageContent.slice(0, 200))
    console.log('Source:', doc.metadata['source'])
  }
}

main().catch(console.error)
```

## Step 7: Parsing Structured Output

Use output parsers to extract typed data from LLM responses.

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, JsonOutputParser, StructuredOutputParser } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

// JSON parser — extracts any JSON object from the response
const jsonParser = new JsonOutputParser()
const jsonPrompt = PromptTemplate.fromTemplate(
  'Return a JSON object with fields "name" and "capital" for this country: {country}\n\n' +
  jsonParser.getFormatInstructions()
)
const jsonChain = new LLMChain(llm, jsonPrompt, { outputParser: jsonParser })
const countryData = await jsonChain.run('France')
console.log(countryData) // { name: "France", capital: "Paris" }

// Structured parser — define a schema for the expected fields
const structuredParser = StructuredOutputParser.fromNamesAndDescriptions({
  pros: 'Comma-separated list of pros',
  cons: 'Comma-separated list of cons',
  verdict: 'One sentence summary verdict'
})

const reviewPrompt = PromptTemplate.fromTemplate(
  'Analyse the pros and cons of {technology}.\n\n' +
  structuredParser.getFormatInstructions()
)
const reviewChain = new LLMChain(llm, reviewPrompt, { outputParser: structuredParser })
const review = await reviewChain.run('TypeScript')
console.log(review.pros)
console.log(review.verdict)
```

## Step 8: Streaming Responses

Stream tokens as they are generated for a responsive UI experience.

```typescript
import { ChatAnthropic, StreamingCallbackHandler } from 'fireworks-plus-plus'

// Method 1: Direct streaming with callback
const llm = new ChatAnthropic()
process.stdout.write('Assistant: ')
await llm.stream(
  [{ role: 'human', content: 'Write a short poem about the ocean.' }],
  (chunk) => {
    if (!chunk.isFinal) {
      process.stdout.write(chunk.text)
    } else {
      process.stdout.write('\n')
    }
  }
)

// Method 2: Using StreamingCallbackHandler with a chain
import { LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const handler = new StreamingCallbackHandler((token) => {
  process.stdout.write(token)
})

const llmWithCallbacks = new ChatAnthropic({ callbacks: [handler] })
const chain = new LLMChain(llmWithCallbacks, PromptTemplate.fromTemplate('{input}'))
await chain.run('Describe the universe in three sentences.')
console.log('\nFull text:', handler.getBuffer())
```

## Next Steps

- Read [Core Concepts](./concepts.md) to understand the architecture
- Explore [Chains](./chains.md) for advanced chain composition
- Learn about [Agents and Tools](./agents.md) for autonomous task execution
- See [Memory](./memory.md) for all available memory strategies
- Check [Intent Routing](./routing.md) to route requests automatically
- Browse [examples/](../examples/) for runnable code
