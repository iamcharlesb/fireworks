/**
 * Example 01: Basic LLM usage
 *
 * Demonstrates:
 * - Calling ChatAnthropic directly
 * - Single-turn and multi-turn conversations
 * - Using RunOptions per call
 */
import { ChatAnthropic } from '../src'
import type { Message } from '../src'

async function main() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 1024
  })

  // ── Single turn ───────────────────────────────────────────────────────────
  console.log('=== Single turn ===')
  const reply = await llm.call([
    { role: 'system', content: 'You are a concise assistant. Keep answers to 2-3 sentences.' },
    { role: 'human', content: 'What are the 3 most important things to know about TypeScript?' }
  ])
  console.log('Assistant:', reply.content)
  console.log()

  // ── Override options per call ──────────────────────────────────────────────
  console.log('=== Deterministic output (temperature: 0) ===')
  const deterministicReply = await llm.call(
    [{ role: 'human', content: 'What is 2 + 2? Reply with just the number.' }],
    { temperature: 0, maxTokens: 10 }
  )
  console.log('Answer:', deterministicReply.content)
  console.log()

  // ── Multi-turn conversation ────────────────────────────────────────────────
  console.log('=== Multi-turn conversation ===')
  const conversation: Message[] = []

  async function chat(userInput: string): Promise<string> {
    conversation.push({ role: 'human', content: userInput })
    const response = await llm.call(conversation)
    conversation.push({ role: 'ai', content: response.content })
    return response.content
  }

  const r1 = await chat('My name is Alice and I am a TypeScript developer.')
  console.log('Turn 1:', r1)

  const r2 = await chat('What programming language do I work with?')
  console.log('Turn 2:', r2)

  const r3 = await chat('What is my name?')
  console.log('Turn 3:', r3)
  console.log()

  // ── predict() — convenience method returning content string ───────────────
  console.log('=== predict() convenience method ===')
  const text = await llm.predict([
    { role: 'human', content: 'Name 3 popular TypeScript frameworks.' }
  ])
  console.log('Frameworks:', text)
}

main().catch(console.error)
