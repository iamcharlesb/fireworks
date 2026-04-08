/**
 * Example 06: Conversation Memory
 *
 * Demonstrates:
 * - ConversationBufferMemory — full history
 * - ConversationWindowMemory — sliding window
 * - ConversationSummaryMemory — LLM-compressed history
 * - ThreadedMemory — multi-user multi-thread sessions
 */
import {
  ChatAnthropic,
  ConversationBufferMemory,
  ConversationWindowMemory,
  ConversationSummaryMemory,
  ThreadedMemory
} from '../src'
import type { Message } from '../src'

const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
  temperature: 0.7
})

// ── Helper: chat using any memory type ───────────────────────────────────────

type Memory = ConversationBufferMemory | ConversationWindowMemory | ConversationSummaryMemory

async function chatWithMemory(
  memory: Memory,
  userInput: string
): Promise<string> {
  // 1. Load existing history
  const vars = await memory.loadMemoryVariables()
  const history = vars['history'] as string

  // 2. Build prompt with history
  const messages: Message[] = []
  if (history) {
    messages.push({
      role: 'system',
      content: `You are a helpful assistant. Here is the conversation history:\n${history}`
    })
  }
  messages.push({ role: 'human', content: userInput })

  // 3. Get LLM response
  const reply = await llm.call(messages)

  // 4. Save to memory
  await memory.saveContext({ input: userInput }, { output: reply.content })

  return reply.content
}

// ── 1. ConversationBufferMemory ───────────────────────────────────────────────

async function demoBufferMemory() {
  console.log('=== ConversationBufferMemory ===')

  const memory = new ConversationBufferMemory({
    memoryKey: 'history',
    humanPrefix: 'User',
    aiPrefix: 'Assistant'
  })

  const turns = [
    'My name is Alice and I am a TypeScript developer.',
    'I have been coding for 8 years.',
    'I work mostly on backend services.',
    'What do you know about me?'
  ]

  for (const turn of turns) {
    const response = await chatWithMemory(memory, turn)
    console.log(`User: ${turn}`)
    console.log(`Assistant: ${response.slice(0, 120)}`)
    console.log()
  }

  console.log('Full history:')
  console.log(memory.getBufferString())
  console.log()
}

// ── 2. ConversationWindowMemory ───────────────────────────────────────────────

async function demoWindowMemory() {
  console.log('=== ConversationWindowMemory (k=2) ===')

  // Only keeps the last 2 exchanges
  const memory = new ConversationWindowMemory({ k: 2 })

  // Add 4 exchanges
  const exchanges = [
    ['What is TypeScript?', ''],
    ['What is React?', ''],
    ['What is Node.js?', ''],
    ['What did I just ask you about?', '']
  ]

  for (const [question] of exchanges) {
    const answer = await chatWithMemory(memory, question)
    console.log(`Q: ${question}`)
    console.log(`A: ${answer.slice(0, 100)}`)
    console.log()
  }

  // The last call should only remember the last 2 exchanges
  const vars = await memory.loadMemoryVariables()
  console.log('Windowed history (last 2 exchanges):')
  console.log(vars['history'])
  console.log()
}

// ── 3. ConversationSummaryMemory ──────────────────────────────────────────────

async function demoSummaryMemory() {
  console.log('=== ConversationSummaryMemory ===')

  const summaryLLM = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0,
    maxTokens: 512
  })

  const memory = new ConversationSummaryMemory({
    llm: summaryLLM,
    maxTokenLimit: 300, // Low threshold so we can see summarisation in action
    memoryKey: 'history'
  })

  const turns = [
    'Tell me one fact about Python.',
    'Tell me one fact about JavaScript.',
    'Tell me one fact about TypeScript.',
    'Tell me one fact about Rust.',
    'What programming languages have we discussed?'
  ]

  for (const turn of turns) {
    const response = await chatWithMemory(memory, turn)
    console.log(`User: ${turn}`)
    console.log(`Assistant: ${response.slice(0, 120)}`)

    const summary = memory.getSummary()
    if (summary) {
      console.log(`[Current summary: "${summary.slice(0, 80)}..."]`)
    }
    console.log()
  }
}

// ── 4. ThreadedMemory ─────────────────────────────────────────────────────────

async function demoThreadedMemory() {
  console.log('=== ThreadedMemory (multi-user) ===')

  const threadMemory = new ThreadedMemory({
    maxThreads: 50,
    maxMessagesPerThread: 100
  })

  // Simulate two users having independent conversations
  const aliceThread = threadMemory.createThread('alice')
  const bobThread = threadMemory.createThread('bob')

  async function userChat(threadId: string, userName: string, userInput: string): Promise<string> {
    const messages = await threadMemory.getThread(threadId)

    const prompt: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...messages,
      { role: 'human', content: userInput }
    ]

    const reply = await llm.call(prompt)

    await threadMemory.addToThread(threadId, { role: 'human', content: userInput })
    await threadMemory.addToThread(threadId, { role: 'ai', content: reply.content })

    return reply.content
  }

  // Alice's conversation
  await userChat(aliceThread, 'Alice', 'My favourite language is TypeScript.')
  const aliceReply2 = await userChat(aliceThread, 'Alice', 'What is my favourite language?')
  console.log('Alice: "What is my favourite language?"')
  console.log(`Bot:   "${aliceReply2.slice(0, 100)}"`)

  // Bob's separate conversation
  await userChat(bobThread, 'Bob', 'I am learning Rust.')
  const bobReply2 = await userChat(bobThread, 'Bob', 'What programming language am I learning?')
  console.log('\nBob: "What programming language am I learning?"')
  console.log(`Bot: "${bobReply2.slice(0, 100)}"`)

  // Verify threads are independent
  threadMemory.setActiveThread(aliceThread)
  const aliceVars = await threadMemory.loadMemoryVariables()
  console.log('\nAlice\'s thread history:')
  console.log(aliceVars['history'])

  // List all threads
  console.log('\nAll threads:')
  threadMemory.listThreads().forEach(t => {
    console.log(`  ${t.id}: ${t.messageCount} messages (last: "${t.lastMessage ?? '—'}")`)
  })
}

// ── Run all demos ─────────────────────────────────────────────────────────────

async function main() {
  await demoBufferMemory()
  await demoWindowMemory()
  await demoSummaryMemory()
  await demoThreadedMemory()
}

main().catch(console.error)
