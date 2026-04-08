/**
 * Example 03: LLMChain and SequentialChain
 *
 * Demonstrates:
 * - LLMChain with PromptTemplate
 * - LLMChain with ChatPromptTemplate
 * - LLMChain with output parser
 * - SequentialChain — multi-step pipeline with named keys
 * - SimpleSequentialChain — single-input/output pipeline
 * - TransformChain — pure data transformation
 */
import {
  ChatAnthropic,
  LLMChain,
  SequentialChain,
  SimpleSequentialChain,
  TransformChain,
  PromptTemplate,
  ChatPromptTemplate,
  JsonOutputParser,
  LoggingCallbackHandler
} from '../src'

async function main() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.7
  })

  // ── Basic LLMChain ─────────────────────────────────────────────────────────
  console.log('=== Basic LLMChain ===')

  const jokePrompt = PromptTemplate.fromTemplate(
    'Tell me a {adjective} joke about {topic}. Keep it to 2 sentences.'
  )
  const jokeChain = new LLMChain(llm, jokePrompt)

  const joke = await jokeChain.run({ adjective: 'short', topic: 'TypeScript generics' })
  console.log('Joke:', joke)
  console.log()

  // ── LLMChain with ChatPromptTemplate ─────────────────────────────────────
  console.log('=== LLMChain with ChatPromptTemplate ===')

  const expertPrompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a {field} expert. Answer in bullet points with at most 3 points.'],
    ['human', '{question}']
  ])
  const expertChain = new LLMChain(llm, expertPrompt)

  const answer = await expertChain.run({
    field: 'TypeScript',
    question: 'What are the biggest advantages of TypeScript over JavaScript?'
  })
  console.log('Expert answer:', answer)
  console.log()

  // ── LLMChain with JSON output parser ─────────────────────────────────────
  console.log('=== LLMChain with JsonOutputParser ===')

  const parser = new JsonOutputParser()
  const countryPrompt = PromptTemplate.fromTemplate(
    `Provide information about {country} as a JSON object.
Include fields: name, capital, population_millions (number), continent.

${parser.getFormatInstructions()}`
  )
  const countryChain = new LLMChain(llm, countryPrompt, { outputParser: parser })

  const countryData = await countryChain.run('Japan')
  console.log('Country data (parsed):', JSON.stringify(countryData, null, 2))
  console.log()

  // ── SimpleSequentialChain ────────────────────────────────────────────────
  console.log('=== SimpleSequentialChain ===')

  const topicPrompt = PromptTemplate.fromTemplate(
    'Generate a one-sentence description of: {input}'
  )
  const hashtagPrompt = PromptTemplate.fromTemplate(
    'Turn this description into 3 hashtags for social media: {input}'
  )

  const descriptionChain = new LLMChain(llm, topicPrompt)
  const hashtagChain = new LLMChain(llm, hashtagPrompt)

  // SimpleSequentialChain: each chain's output becomes the next chain's input
  const simpleSeq = new SimpleSequentialChain([descriptionChain, hashtagChain], { verbose: true })
  const hashtags = await simpleSeq.call({ input: 'artificial intelligence' })
  console.log('Generated hashtags:', hashtags['output'])
  console.log()

  // ── SequentialChain with multiple named keys ──────────────────────────────
  console.log('=== SequentialChain with named keys ===')

  // Step 1: Summarise an article
  const summarisePrompt = PromptTemplate.fromTemplate(
    'Summarise this text in 1-2 sentences:\n\n{article}'
  )
  const summariseChain = new LLMChain(llm, summarisePrompt, { outputKey: 'summary' })

  // Step 2: Extract the tone
  const tonePrompt = PromptTemplate.fromTemplate(
    'What is the tone of this text: {summary}\nReply with one word: positive, negative, or neutral.'
  )
  const toneChain = new LLMChain(llm, tonePrompt, { outputKey: 'tone' })

  const article = `
    The new TypeScript 5.8 release brings dramatic performance improvements to the
    type checker, cutting compile times by up to 40% on large codebases. The team
    has also added highly requested features for better inference in complex generic
    scenarios, making the developer experience significantly smoother.
  `

  const seq = new SequentialChain(
    [summariseChain, toneChain],
    ['article'],           // Overall pipeline inputs
    ['summary', 'tone'],   // Overall pipeline outputs
    { verbose: false }
  )

  const seqResult = await seq.call({ article })
  console.log('Summary:', seqResult['summary'])
  console.log('Tone:', seqResult['tone'])
  console.log()

  // ── TransformChain ────────────────────────────────────────────────────────
  console.log('=== TransformChain ===')

  // Transform: split a comma-separated list into words and count them
  const splitTransform = new TransformChain({
    inputVariables: ['csv'],
    outputVariables: ['items', 'count'],
    transform: (inputs) => {
      const items = String(inputs['csv']).split(',').map(s => s.trim())
      return { items: items.join(', '), count: String(items.length) }
    }
  })

  const transformResult = await splitTransform.call({ csv: ' apples , bananas, cherries , dates' })
  console.log('Items:', transformResult['items'])
  console.log('Count:', transformResult['count'])
  console.log()

  // ── Combining TransformChain with LLMChain in SequentialChain ─────────────
  console.log('=== Transform + LLM pipeline ===')

  const uppercaseTransform = new TransformChain({
    inputVariables: ['text'],
    outputVariables: ['processedText'],
    transform: (inputs) => ({
      processedText: `[PROCESSED]: ${String(inputs['text']).trim()}`
    })
  })

  const finalPrompt = PromptTemplate.fromTemplate(
    'Here is some processed data. Write a one-sentence insight about it:\n{processedText}'
  )
  const finalChain = new LLMChain(llm, finalPrompt, { outputKey: 'insight' })

  const pipeline = new SequentialChain(
    [uppercaseTransform, finalChain],
    ['text'],
    ['insight']
  )

  const pipelineResult = await pipeline.call({ text: 'Q1 revenue: $4.2M, up 15% year over year' })
  console.log('Insight:', pipelineResult['insight'])

  // ── Using callbacks with chains ───────────────────────────────────────────
  console.log('\n=== Chain with callbacks ===')

  const logger = new LoggingCallbackHandler({ level: 'info', prefix: '[Example03]' })
  const monitoredChain = new LLMChain(
    llm,
    PromptTemplate.fromTemplate('Say hello to {name} in one sentence.'),
    { callbacks: [logger] }
  )

  await monitoredChain.run({ name: 'the world' })
}

main().catch(console.error)
