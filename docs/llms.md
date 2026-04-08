# LLMs and Chat Models

Fireworks++ supports five LLM providers out of the box: Anthropic, OpenAI, Gemini, Perplexity, and Ollama. All providers share a common interface, so you can swap between them with minimal code changes.

## BaseLLM vs BaseChatModel

There are two base classes:

| Class | Input | Output | Best for |
|-------|-------|--------|----------|
| `BaseLLM` | Plain text string | Plain text string | Older completion models |
| `BaseChatModel` | Array of `Message` objects | A single `Message` | Modern chat models (Claude, GPT-4, etc.) |

Modern LLM applications almost always use `BaseChatModel`. The `BaseLLM` class exists for compatibility with older-style text completion APIs.

### BaseLLM Interface

```typescript
// Core method
abstract generate(prompts: string[], options?: RunOptions): Promise<LLMResult>

// Convenience methods
call(prompt: string, options?: RunOptions): Promise<string>
predict(text: string, options?: RunOptions): Promise<string>
stream(prompt: string, callback: StreamCallback, options?: RunOptions): Promise<void>
```

### BaseChatModel Interface

```typescript
// Core method
abstract generate(messages: Message[][], options?: RunOptions): Promise<LLMResult>

// Convenience methods
call(messages: Message[], options?: RunOptions): Promise<Message>
predict(messages: Message[], options?: RunOptions): Promise<string>
invoke(messages: Message[], options?: RunOptions): Promise<Message>
stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void>
callWithTools(messages: Message[], tools: FunctionDefinition[], options?: ToolCallOptions): Promise<Message>
generateStructured<T>(messages: Message[], schema: StructuredOutputSchema, options?: RunOptions): Promise<T>
```

`callWithTools()` and `generateStructured()` are implemented natively by `ChatOpenAI`, `ChatAnthropic`, and `ChatGemini`.

---

## ChatAnthropic

Wraps Anthropic's Claude models. Uses the Messages API directly via `fetch`.

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // or reads ANTHROPIC_API_KEY env var
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1.0,
  timeout: 60_000,
  anthropicVersion: '2023-06-01',
  systemPrompt: 'You are a helpful assistant.', // optional default system prompt
  verbose: false,
  streaming: false
})
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `ANTHROPIC_API_KEY` env | Anthropic API key |
| `model` | `string` | `claude-3-5-sonnet-20241022` | Model name |
| `temperature` | `number` | `0.7` | Sampling temperature (0–1) |
| `maxTokens` | `number` | `2048` | Maximum tokens to generate |
| `topP` | `number` | `1.0` | Nucleus sampling parameter |
| `stop` | `string[]` | `[]` | Stop sequences |
| `timeout` | `number` | `60000` | Request timeout in milliseconds |
| `baseUrl` | `string` | `https://api.anthropic.com` | Override API endpoint |
| `anthropicVersion` | `string` | `2023-06-01` | Anthropic API version header |
| `systemPrompt` | `string` | — | Default system message |
| `verbose` | `boolean` | `false` | Log debug information |
| `callbacks` | `CallbackHandler[]` | `[]` | Lifecycle callbacks |

### Available Models

| Model | Context | Notes |
|-------|---------|-------|
| `claude-opus-4-5` | 200K | Most capable |
| `claude-sonnet-4-5` | 200K | Balanced speed/quality |
| `claude-haiku-3-5` | 200K | Fastest, lowest cost |
| `claude-3-5-sonnet-20241022` | 200K | Previous generation, widely used |

### Message Format

Fireworks++ maps its `MessageRole` types to Anthropic's format:

| Fireworks++ role | Anthropic role |
|--------------------|----------------|
| `system` | Becomes `system` field in the request body |
| `human` | `user` |
| `ai` | `assistant` |
| `tool` / `function` | `user` (with "Tool result:" prefix) |

### Streaming with ChatAnthropic

`ChatAnthropic` has native streaming support using SSE:

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ model: 'claude-3-5-sonnet-20241022' })

await llm.stream(
  [
    { role: 'system', content: 'You are a poet.' },
    { role: 'human', content: 'Write a haiku about the sea.' }
  ],
  (chunk) => {
    if (!chunk.isFinal) {
      process.stdout.write(chunk.text)
    }
  }
)
```

### Native Tool Calling and Structured Output

`ChatAnthropic` supports native tool use and schema-driven structured output:

```typescript
import { ChatAnthropic, DynamicTool } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const tool = new DynamicTool({
  name: 'get_weather',
  description: 'Get weather by city',
  func: async (input) => ({ output: `Sunny in ${input}` })
})

const toolReply = await llm.callWithTools(
  [{ role: 'human', content: 'Weather in Tokyo?' }],
  [tool.toSchema()],
  { toolChoice: 'required' }
)

const structured = await llm.generateStructured(
  [{ role: 'human', content: 'Return the capital of France.' }],
  {
    name: 'capital_answer',
    schema: {
      type: 'object',
      properties: { capital: { type: 'string' } },
      required: ['capital']
    }
  }
)
```

---

## ChatOpenAI

Wraps OpenAI's chat completion API.

```typescript
import { ChatOpenAI } from 'fireworks-plus-plus'

const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048
})

const reply = await llm.call([
  { role: 'human', content: 'What is 2 + 2?' }
])
console.log(reply.content)
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `OPENAI_API_KEY` env | OpenAI API key |
| `model` | `string` | `gpt-4o` | Model name |
| `temperature` | `number` | `0.7` | Sampling temperature |
| `maxTokens` | `number` | `2048` | Max tokens |
| `topP` | `number` | `1.0` | Nucleus sampling |
| `baseUrl` | `string` | OpenAI API | Override for Azure or proxy |
| `organization` | `string` | — | OpenAI organization ID |

### Available Models

| Model | Notes |
|-------|-------|
| `gpt-4o` | Latest GPT-4 Omni |
| `gpt-4o-mini` | Fast, cost-effective |
| `gpt-4-turbo` | Previous generation |
| `o1` | Reasoning model |
| `o3-mini` | Compact reasoning model |

### Native Tool Calling and Structured Output

`ChatOpenAI` supports OpenAI-native tool calling via `tools` / `tool_choice` and structured outputs via `response_format: { type: 'json_schema' }`:

```typescript
import { ChatOpenAI, DynamicTool } from 'fireworks-plus-plus'

const llm = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY })
const tool = new DynamicTool({
  name: 'get_weather',
  description: 'Get weather by city',
  func: async (input) => ({ output: `Sunny in ${input}` })
})

const toolReply = await llm.callWithTools(
  [{ role: 'human', content: 'Weather in Tokyo?' }],
  [tool.toSchema()],
  { toolChoice: 'auto' }
)

const structured = await llm.generateStructured(
  [{ role: 'human', content: 'Return the capital of France.' }],
  {
    name: 'capital_answer',
    schema: {
      type: 'object',
      properties: { capital: { type: 'string' } },
      required: ['capital'],
      additionalProperties: false
    }
  }
)
```

---

## ChatGemini

Wraps Google's Gemini API through the `generateContent` endpoint.

```typescript
import { ChatGemini } from 'fireworks-plus-plus'

const llm = new ChatGemini({
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-2.0-flash'
})
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `GEMINI_API_KEY` env | Gemini API key |
| `model` | `string` | `gemini-2.0-flash` | Model name |
| `temperature` | `number` | `0.7` | Sampling temperature |
| `maxTokens` | `number` | `2048` | Max output tokens |
| `baseUrl` | `string` | Google API | Override Gemini endpoint |

### Native Tool Calling and Structured Output

`ChatGemini` supports Gemini function declarations and JSON-schema structured responses:

```typescript
import { ChatGemini } from 'fireworks-plus-plus'

const llm = new ChatGemini({ apiKey: process.env.GEMINI_API_KEY })

const toolReply = await llm.callWithTools(
  [{ role: 'human', content: 'Weather in Tokyo?' }],
  [
    {
      name: 'get_weather',
      description: 'Get weather by city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } }
      }
    }
  ]
)

const structured = await llm.generateStructured(
  [{ role: 'human', content: 'Return the capital of France.' }],
  {
    name: 'capital_answer',
    schema: {
      type: 'object',
      properties: { capital: { type: 'string' } }
    }
  }
)
```

---

## ChatPerplexity

Wraps the Perplexity API, which combines LLM generation with web search.

```typescript
import { ChatPerplexity } from 'fireworks-plus-plus'

const llm = new ChatPerplexity({
  apiKey: process.env.PERPLEXITY_API_KEY,
  model: 'llama-3.1-sonar-large-128k-online',
  temperature: 0.2
})

const reply = await llm.call([
  { role: 'human', content: 'What happened in AI this week?' }
])
console.log(reply.content) // Answer grounded in current web results
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `PERPLEXITY_API_KEY` env | Perplexity API key |
| `model` | `string` | `llama-3.1-sonar-large-128k-online` | Model name |
| `temperature` | `number` | `0.2` | Sampling temperature |
| `maxTokens` | `number` | `2048` | Max tokens |

### Available Models

| Model | Context | Notes |
|-------|---------|-------|
| `llama-3.1-sonar-large-128k-online` | 127K | Online search, high quality |
| `llama-3.1-sonar-small-128k-online` | 127K | Online search, faster |
| `llama-3.1-sonar-large-128k-chat` | 127K | Chat only, no search |

---

## ChatOllama

Wraps the Ollama local inference server, letting you run open-source models entirely on your own hardware with no API key required.

### Setup

1. Install Ollama from [https://ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2`
3. Ollama starts automatically on `http://localhost:11434`

```typescript
import { ChatOllama } from 'fireworks-plus-plus'

const llm = new ChatOllama({
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434', // default
  temperature: 0.7
})

const reply = await llm.call([
  { role: 'human', content: 'Explain async/await in JavaScript.' }
])
console.log(reply.content)
```

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `llama3.2` | Model name (must be pulled locally) |
| `baseUrl` | `string` | `http://localhost:11434` | Ollama server URL |
| `temperature` | `number` | `0.7` | Sampling temperature |
| `maxTokens` | `number` | `2048` | Max tokens |

### Popular Models

| Model | Pull command | Size |
|-------|-------------|------|
| Llama 3.2 3B | `ollama pull llama3.2` | 2.0 GB |
| Llama 3.2 11B | `ollama pull llama3.2:11b` | 7.9 GB |
| Mistral 7B | `ollama pull mistral` | 4.1 GB |
| Gemma 2 9B | `ollama pull gemma2` | 5.4 GB |
| Phi-3 Mini | `ollama pull phi3` | 2.2 GB |
| Qwen 2.5 7B | `ollama pull qwen2.5` | 4.7 GB |

---

## Text Completion LLMs

For text completion (non-chat) use cases, each provider also has a non-chat variant:

```typescript
import { Anthropic, OpenAI, PerplexityLLM, OllamaLLM } from 'fireworks-plus-plus'

// Text completion — takes a string prompt, returns a string
const anthropicLLM = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const text = await anthropicLLM.call('Once upon a time')
```

These are useful when working with older model APIs or when you want to avoid message formatting. The `LLMChain` automatically detects whether it has a `BaseLLM` or a `BaseChatModel` and formats the prompt accordingly.

---

## Multiple Providers in One Application

Because all models share the same interface, you can use different providers for different tasks:

```typescript
import { ChatAnthropic, ChatOllama, ChatOpenAI, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

// Use Claude for complex reasoning
const claudeLLM = new ChatAnthropic({ model: 'claude-opus-4-5' })

// Use Ollama for quick local inference
const ollamaLLM = new ChatOllama({ model: 'llama3.2' })

// Use GPT-4o-mini for cost-sensitive tasks
const miniLLM = new ChatOpenAI({ model: 'gpt-4o-mini' })

const complexChain = new LLMChain(claudeLLM, complexPrompt)
const simpleChain = new LLMChain(ollamaLLM, simplePrompt)
const cheapChain = new LLMChain(miniLLM, cheapPrompt)
```

---

## RunOptions

All `call()`, `predict()`, and `generate()` methods accept an optional `RunOptions` object to override defaults per-call:

```typescript
import type { RunOptions } from 'fireworks-plus-plus'

const options: RunOptions = {
  temperature: 0.0,     // Deterministic output for this call
  maxTokens: 512,       // Limit response length
  stop: ['```'],        // Stop before a code fence
  timeout: 30_000,      // 30 second timeout
  callbacks: [myLogger] // Per-call callbacks
}

const reply = await llm.call(messages, options)
```

---

## Streaming Example

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

let fullText = ''
await llm.stream(
  [{ role: 'human', content: 'Count from 1 to 10, one number per line.' }],
  async (chunk) => {
    if (chunk.isFirst) console.log('Streaming started...')
    if (!chunk.isFinal) {
      process.stdout.write(chunk.text)
      fullText += chunk.text
    }
    if (chunk.isFinal) console.log('\nStream complete.')
  }
)
console.log('Total length:', fullText.length)
```
