/**
 * Example 08: Streaming
 *
 * Demonstrates:
 * - Direct ChatAnthropic.stream() with inline callback
 * - StreamingCallbackHandler for token accumulation
 * - Using callbacks attached to the LLM for automatic streaming
 * - Measuring streaming performance
 */
import {
  ChatAnthropic,
  StreamingCallbackHandler,
  LoggingCallbackHandler
} from '../src'

// ── 1. Direct streaming with inline callback ──────────────────────────────────

async function directStreaming() {
  console.log('=== Direct Streaming ===\n')

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.8
  })

  let tokenCount = 0
  const startTime = Date.now()

  process.stdout.write('Assistant: ')
  await llm.stream(
    [
      { role: 'system', content: 'You are a creative writing assistant.' },
      { role: 'human', content: 'Write a haiku about programming in TypeScript.' }
    ],
    async (chunk) => {
      if (chunk.isFirst) {
        // First token received
      }
      if (!chunk.isFinal) {
        process.stdout.write(chunk.text)
        tokenCount++
      }
      if (chunk.isFinal) {
        const elapsed = Date.now() - startTime
        console.log(`\n\n[Streaming complete: ${tokenCount} tokens in ${elapsed}ms]`)
      }
    }
  )
  console.log()
}

// ── 2. StreamingCallbackHandler ───────────────────────────────────────────────

async function streamingWithCallbackHandler() {
  console.log('=== StreamingCallbackHandler ===\n')

  // The handler collects every token and exposes the full buffer
  const handler = new StreamingCallbackHandler((token: string) => {
    process.stdout.write(token)
  })

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.7
    // Note: StreamingCallbackHandler collects tokens emitted via onLLMNewToken.
    // For native streaming, call llm.stream() directly.
  })

  // Use handler with direct stream call
  process.stdout.write('Counting: ')
  let buffer = ''
  await llm.stream(
    [{ role: 'human', content: 'Count from 1 to 5, one number per line.' }],
    (chunk) => {
      if (!chunk.isFinal) {
        process.stdout.write(chunk.text)
        buffer += chunk.text
      }
    }
  )
  console.log('\n')

  // Access the buffer
  handler.reset()
  console.log('Buffer contents would be available via handler.getBuffer()')
  console.log('Buffer snippet:', buffer.slice(0, 50))
  console.log()
}

// ── 3. Multiple concurrent streams ────────────────────────────────────────────

async function concurrentStreams() {
  console.log('=== Concurrent Streaming ===\n')

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.7
  })

  const prompts = [
    'Give a one-sentence definition of "recursion".',
    'Give a one-sentence definition of "closure".',
    'Give a one-sentence definition of "monad".'
  ]

  // Start all streams concurrently
  const buffers: string[] = new Array(prompts.length).fill('')
  const streamPromises = prompts.map((prompt, i) =>
    llm.stream(
      [{ role: 'human', content: prompt }],
      (chunk) => {
        if (!chunk.isFinal) buffers[i] += chunk.text
      }
    )
  )

  await Promise.all(streamPromises)

  // Print results
  prompts.forEach((prompt, i) => {
    console.log(`Q: ${prompt}`)
    console.log(`A: ${buffers[i].trim()}`)
    console.log()
  })
}

// ── 4. Streaming with stop sequences ─────────────────────────────────────────

async function streamingWithStop() {
  console.log('=== Streaming with Stop Sequences ===\n')

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.5
  })

  let output = ''
  process.stdout.write('List: ')

  await llm.stream(
    [{ role: 'human', content: 'List 5 TypeScript features. Format: 1. feature\n2. feature\netc.' }],
    (chunk) => {
      if (!chunk.isFinal) {
        process.stdout.write(chunk.text)
        output += chunk.text
      }
    },
    { stop: ['6.', '\n6'] }  // Stop before item 6 in case the model goes further
  )

  console.log('\n\nTotal length:', output.length, 'chars')
  console.log()
}

// ── 5. Streaming latency measurement ──────────────────────────────────────────

async function measureStreamingLatency() {
  console.log('=== Streaming Latency Measurement ===\n')

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0
  })

  let firstTokenTime: number | null = null
  let lastTokenTime: number | null = null
  let tokenCount = 0
  const requestStart = Date.now()

  await llm.stream(
    [{ role: 'human', content: 'Say "hello" in 10 different languages, one per line.' }],
    (chunk) => {
      if (!chunk.isFinal) {
        if (firstTokenTime === null) {
          firstTokenTime = Date.now()
        }
        lastTokenTime = Date.now()
        tokenCount++
        process.stdout.write(chunk.text)
      }
    }
  )

  const ttft = firstTokenTime ? firstTokenTime - requestStart : 0
  const totalTime = lastTokenTime ? lastTokenTime - requestStart : 0

  console.log(`\n\nPerformance:`)
  console.log(`  Time to first token: ${ttft}ms`)
  console.log(`  Total streaming time: ${totalTime}ms`)
  console.log(`  Approximate tokens: ${tokenCount}`)
  if (totalTime > 0) {
    console.log(`  Token rate: ~${Math.round(tokenCount / (totalTime / 1000))} tokens/sec`)
  }
  console.log()
}

// ── 6. Streaming with LoggingCallbackHandler ───────────────────────────────────

async function streamingWithLogger() {
  console.log('=== Streaming with Logger ===\n')

  const logger = new LoggingCallbackHandler({ level: 'info', prefix: '[Stream]' })

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.5,
    callbacks: [logger]
  })

  // Logger will fire onLLMStart/onLLMEnd
  // Streaming tokens are handled via the stream callback
  process.stdout.write('Answer: ')
  await llm.stream(
    [{ role: 'human', content: 'What is 2 ** 10? Just the number.' }],
    (chunk) => {
      if (!chunk.isFinal) process.stdout.write(chunk.text)
      else console.log()
    }
  )
}

// ── Run all demos ─────────────────────────────────────────────────────────────

async function main() {
  await directStreaming()
  await streamingWithCallbackHandler()
  await concurrentStreams()
  await streamingWithStop()
  await measureStreamingLatency()
  await streamingWithLogger()
}

main().catch(console.error)
