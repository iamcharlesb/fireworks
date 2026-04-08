# Memory

Memory systems persist conversation history and make it available to chains and agents across multiple calls. Without memory, every LLM call is completely stateless.

## BaseMemory

All memory classes implement the `BaseMemory` interface:

```typescript
abstract class BaseMemory {
  abstract memoryKeys: string[]

  // Load stored values for use as chain inputs
  abstract loadMemoryVariables(inputs?: ChainValues): Promise<Record<string, unknown>>

  // Save a completed input/output exchange
  abstract saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void>

  // Wipe all stored history
  abstract clear(): Promise<void>

  abstract toString(): string
}
```

## BaseChatMemory

Memory implementations that store `Message` objects extend `BaseChatMemory`:

```typescript
abstract class BaseChatMemory extends BaseMemory {
  // Access raw messages
  getChatMessages(): Message[]

  // Add messages directly
  addMessage(message: Message): void
  addUserMessage(content: string): void
  addAIMessage(content: string): void

  async clear(): Promise<void>  // Clears messages array
}
```

---

## ConversationBufferMemory

The simplest memory: stores every message verbatim in a growing buffer. Best for short-to-medium conversations where you want complete context.

```typescript
import { ConversationBufferMemory } from 'fireworks-plus-plus'

const memory = new ConversationBufferMemory({
  memoryKey: 'history',     // Key used in loadMemoryVariables() output
  humanPrefix: 'Human',     // Prefix for human messages in string format
  aiPrefix: 'AI',           // Prefix for AI messages in string format
  inputKey: 'input',        // Which key in inputs is the human message
  outputKey: 'output',      // Which key in outputs is the AI message
  returnMessages: false     // If true, returns Message[] instead of string
})

// Save exchanges
await memory.saveContext(
  { input: 'Hello, my name is Alice.' },
  { output: 'Hello Alice! How can I help you today?' }
)
await memory.saveContext(
  { input: 'What is my name?' },
  { output: 'Your name is Alice.' }
)

// Load as a formatted string
const vars = await memory.loadMemoryVariables()
console.log(vars['history'])
// Human: Hello, my name is Alice.
// AI: Hello Alice! How can I help you today?
// Human: What is my name?
// AI: Your name is Alice.

// Load as Message objects
const bufferWithMessages = new ConversationBufferMemory({ returnMessages: true })
await bufferWithMessages.saveContext({ input: 'Hi' }, { output: 'Hello!' })
const msgVars = await bufferWithMessages.loadMemoryVariables()
console.log(msgVars['history'])
// [{ role: 'human', content: 'Hi' }, { role: 'ai', content: 'Hello!' }]
```

### Using with a Chain

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate, ConversationBufferMemory } from 'fireworks-plus-plus'

const memory = new ConversationBufferMemory()
const llm = new ChatAnthropic()

async function conversationStep(userInput: string): Promise<string> {
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
  await memory.saveContext({ input: userInput }, { output: reply.content })
  return reply.content
}

await conversationStep('Tell me about Paris.')
const response = await conversationStep('What is the main monument there?')
// The model knows "there" refers to Paris from memory
```

### Config

```typescript
interface BufferMemoryConfig {
  humanPrefix?: string      // Default: "Human"
  aiPrefix?: string         // Default: "AI"
  memoryKey?: string        // Default: "history"
  inputKey?: string         // Auto-detected from first key if omitted
  outputKey?: string        // Auto-detected from first key if omitted
  returnMessages?: boolean  // Default: false (returns string)
}
```

---

## ConversationWindowMemory

Like `ConversationBufferMemory` but caps the stored history to the last `k` human+AI exchanges. Older messages are discarded automatically. Prevents unbounded context growth.

```typescript
import { ConversationWindowMemory } from 'fireworks-plus-plus'

// Keep only the 3 most recent exchanges (6 messages: 3 human + 3 AI)
const memory = new ConversationWindowMemory({
  k: 3,
  humanPrefix: 'User',
  aiPrefix: 'Bot',
  memoryKey: 'recent_history'
})

// Add more than k exchanges
for (let i = 1; i <= 5; i++) {
  await memory.saveContext(
    { input: `Question ${i}` },
    { output: `Answer ${i}` }
  )
}

const vars = await memory.loadMemoryVariables()
console.log(vars['recent_history'])
// User: Question 3
// Bot: Answer 3
// User: Question 4
// Bot: Answer 4
// User: Question 5
// Bot: Answer 5
// (Questions 1 and 2 are gone)
```

### Config

```typescript
interface WindowMemoryConfig {
  k?: number              // Default: 5 (number of exchanges to keep)
  humanPrefix?: string    // Default: "Human"
  aiPrefix?: string       // Default: "AI"
  memoryKey?: string      // Default: "history"
  inputKey?: string
  outputKey?: string
  returnMessages?: boolean  // Default: false
}
```

---

## ConversationSummaryMemory

Uses an LLM to compress old conversation history into a running summary. When the estimated token count of the accumulated messages exceeds `maxTokenLimit`, the older messages are summarised and replaced with that summary. This allows arbitrarily long conversations without exceeding context limits.

```typescript
import { ChatAnthropic, ConversationSummaryMemory } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()
const memory = new ConversationSummaryMemory({
  llm,
  maxTokenLimit: 2000,    // Trigger summarisation when buffer exceeds ~2000 tokens
  memoryKey: 'history',
  humanPrefix: 'Human',
  aiPrefix: 'AI',
  // Optional: override the summarisation prompt
  summaryPrompt: `Progressively summarize the lines of conversation provided, adding onto the previous summary returning a new summary.

Current summary:
{summary}

New lines of conversation:
{new_lines}

New summary:`
})

// Add many exchanges
for (let i = 0; i < 20; i++) {
  await memory.saveContext(
    { input: `This is message number ${i}. Tell me about topic ${i}.` },
    { output: `Here is information about topic ${i}. It is quite fascinating.` }
  )
}

// Memory automatically summarised old messages
const vars = await memory.loadMemoryVariables()
console.log(vars['history'])
// "Summary:
//  The conversation covered topics 0 through 17 in sequence...
//
//  Recent:
//  Human: This is message number 18...
//  AI: Here is information about topic 18..."

// Access the current summary directly
console.log(memory.getSummary())
```

### Config

```typescript
interface SummaryMemoryConfig {
  llm: BaseChatModel       // Required: LLM used for summarisation
  humanPrefix?: string     // Default: "Human"
  aiPrefix?: string        // Default: "AI"
  memoryKey?: string       // Default: "history"
  inputKey?: string
  outputKey?: string
  maxTokenLimit?: number   // Default: 2000 (estimated tokens; 4 chars ~= 1 token)
  summaryPrompt?: string   // Override the summarisation prompt template
}
```

**Cost note:** `ConversationSummaryMemory` makes additional LLM calls to summarise. Use `ConversationWindowMemory` if you want to avoid extra API cost.

---

## ThreadedMemory

Manages multiple independent conversation threads. Each thread is an isolated conversation identified by a string ID. This is ideal for chat applications where a single server handles many users' separate conversations simultaneously.

```typescript
import { ThreadedMemory } from 'fireworks-plus-plus'
import type { ThreadSummary } from 'fireworks-plus-plus'

const memory = new ThreadedMemory({
  maxThreads: 100,             // Maximum concurrent threads before eviction
  maxMessagesPerThread: 1000   // Max messages per thread before trimming
})

// Create threads
const aliceThread = memory.createThread('alice-session-1')
const bobThread = memory.createThread('bob-session-42')

// Add messages to specific threads
await memory.addToThread(aliceThread, { role: 'human', content: 'Hi, I need help with Python.' })
await memory.addToThread(aliceThread, { role: 'ai', content: 'I would be happy to help with Python!' })

await memory.addToThread(bobThread, { role: 'human', content: 'What is the weather like?' })
await memory.addToThread(bobThread, { role: 'ai', content: 'I cannot check the weather directly.' })

// Switch the active thread for loadMemoryVariables() / saveContext()
memory.setActiveThread(aliceThread)
const vars = await memory.loadMemoryVariables()
console.log(vars['history'])
// Human: Hi, I need help with Python.
// AI: I would be happy to help with Python!
console.log(vars['threadId']) // "alice-session-1"

// Retrieve messages from any thread directly
const bobMessages = await memory.getThread(bobThread)
console.log(bobMessages)
// [{ role: 'human', content: 'What is the weather like?' }, ...]

// List all thread summaries
const summaries: ThreadSummary[] = memory.listThreads()
summaries.forEach(s => {
  console.log(`${s.id}: ${s.messageCount} messages, last: "${s.lastMessage}"`)
})

// Delete a thread
memory.deleteThread(bobThread)

// Clear a specific thread's messages without deleting it
await memory.clearThread(aliceThread)

// Clear everything
await memory.clear()
```

### Routing by Thread ID

In a real application, associate thread IDs with user session IDs:

```typescript
import { ThreadedMemory, ChatAnthropic } from 'fireworks-plus-plus'

const memory = new ThreadedMemory()
const llm = new ChatAnthropic()
const threads = new Map<string, string>() // userId -> threadId

async function handleMessage(userId: string, userInput: string): Promise<string> {
  // Get or create a thread for this user
  if (!threads.has(userId)) {
    const threadId = memory.createThread(`user-${userId}`)
    threads.set(userId, threadId)
  }

  const threadId = threads.get(userId)!
  memory.setActiveThread(threadId)

  // Get conversation history
  const messages = await memory.getThread(threadId)

  // Build prompt with history
  const prompt = [
    { role: 'system' as const, content: 'You are a helpful assistant.' },
    ...messages,
    { role: 'human' as const, content: userInput }
  ]

  const reply = await llm.call(prompt)

  // Save new exchange
  await memory.addToThread(threadId, { role: 'human', content: userInput })
  await memory.addToThread(threadId, { role: 'ai', content: reply.content })

  return reply.content
}

// Handle messages from different users independently
await handleMessage('user-alice', 'My name is Alice.')
await handleMessage('user-bob', 'My name is Bob.')
console.log(await handleMessage('user-alice', 'What is my name?')) // "Alice"
console.log(await handleMessage('user-bob', 'What is my name?'))   // "Bob"
```

### Config

```typescript
interface ThreadMemoryConfig {
  maxThreads?: number              // Default: 100
  maxMessagesPerThread?: number    // Default: 1000
  defaultThreadId?: string         // Create with a specific initial thread ID
}
```

### ThreadSummary Shape

```typescript
interface ThreadSummary {
  id: string
  messageCount: number
  firstMessage?: string    // First 50 chars of first message
  lastMessage?: string     // First 50 chars of last message
  createdAt: Date
  updatedAt: Date
}
```

---

## Choosing a Memory Strategy

| Memory | Best for | Token growth |
|--------|----------|-------------|
| `ConversationBufferMemory` | Short conversations, demos | Unbounded |
| `ConversationWindowMemory` | Moderate conversations, predictable cost | Bounded by `k` |
| `ConversationSummaryMemory` | Long conversations, rich context | Bounded (LLM cost for summaries) |
| `ThreadedMemory` | Multi-user apps, chat servers | Per-thread, configurable |
