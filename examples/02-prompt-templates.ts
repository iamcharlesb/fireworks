/**
 * Example 02: Prompt Templates
 *
 * Demonstrates:
 * - PromptTemplate with auto-extracted variables
 * - PromptTemplate.partial() for pre-filling variables
 * - ChatPromptTemplate for structured message lists
 * - FewShotPromptTemplate for in-context learning
 * - SystemMessagePromptTemplate and HumanMessagePromptTemplate
 */
import {
  ChatAnthropic,
  PromptTemplate,
  ChatPromptTemplate,
  FewShotPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate
} from '../src'

async function main() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.7
  })

  // ── PromptTemplate ─────────────────────────────────────────────────────────
  console.log('=== PromptTemplate ===')

  // Auto-extract variables from {braces}
  const greetingPrompt = PromptTemplate.fromTemplate(
    'Write a greeting for someone named {name} who works as a {job}.'
  )
  console.log('Variables:', greetingPrompt.getInputVariables())
  // => ["name", "job"]

  const formatted = greetingPrompt.format({ name: 'Alice', job: 'software engineer' })
  console.log('Formatted prompt:', formatted)

  const greetReply = await llm.call([{ role: 'human', content: formatted }])
  console.log('Reply:', greetReply.content)
  console.log()

  // ── PromptTemplate.partial() ───────────────────────────────────────────────
  console.log('=== Partial template ===')

  const translationPrompt = PromptTemplate.fromTemplate(
    'Translate the following text from {source} to {target}: "{text}"'
  )

  // Pre-fill the source language
  const fromEnglish = translationPrompt.partial({ source: 'English' })
  console.log('Remaining variables:', fromEnglish.getInputVariables())
  // => ["target", "text"]

  const spanish = fromEnglish.format({ target: 'Spanish', text: 'Good morning, world!' })
  const translateReply = await llm.call([{ role: 'human', content: spanish }])
  console.log('Spanish:', translateReply.content)
  console.log()

  // ── ChatPromptTemplate ────────────────────────────────────────────────────
  console.log('=== ChatPromptTemplate ===')

  const chatPrompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are an expert {domain} assistant. Be precise and technical.'],
    ['human', 'Explain this concept: {concept}']
  ])

  const messages = chatPrompt.formatMessages({
    domain: 'TypeScript',
    concept: 'conditional types'
  })

  console.log('Messages produced:')
  messages.forEach(m => console.log(`  [${m.role}] ${m.content.slice(0, 60)}...`))

  const chatReply = await llm.call(messages)
  console.log('Reply:', chatReply.content.slice(0, 200), '...')
  console.log()

  // ── ChatPromptTemplate.partial() ─────────────────────────────────────────
  console.log('=== ChatPromptTemplate partial ===')

  const reviewPrompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a {role}. Rate the following on a scale of 1-10 and justify briefly.'],
    ['human', '{item}']
  ])

  const codeReviewPrompt = reviewPrompt.partial({ role: 'senior code reviewer' })
  const codeMessages = codeReviewPrompt.formatMessages({
    item: 'const x = eval(userInput)'
  })
  const codeReply = await llm.call(codeMessages)
  console.log('Code review:', codeReply.content)
  console.log()

  // ── FewShotPromptTemplate ─────────────────────────────────────────────────
  console.log('=== FewShotPromptTemplate ===')

  const antonymPrompt = new FewShotPromptTemplate({
    examples: [
      { word: 'happy', antonym: 'sad' },
      { word: 'fast', antonym: 'slow' },
      { word: 'light', antonym: 'dark' }
    ],
    exampleTemplate: 'Word: {word}\nAntonym: {antonym}',
    prefix: 'Give the antonym of each word.',
    suffix: 'Word: {word}\nAntonym:',
    inputVariables: ['word']
  })

  const antonymFormatted = antonymPrompt.format({ word: 'ancient' })
  console.log('Few-shot prompt snippet:', antonymFormatted.slice(0, 200), '...')

  const antonymReply = await llm.call([{ role: 'human', content: antonymFormatted }])
  console.log('Antonym:', antonymReply.content.trim())
  console.log()

  // ── SystemMessagePromptTemplate + HumanMessagePromptTemplate ─────────────
  console.log('=== Message templates ===')

  const systemTemplate = new SystemMessagePromptTemplate(
    'You are a {persona} who always speaks in a {style} tone.'
  )
  const humanTemplate = new HumanMessagePromptTemplate('{question}')

  const systemMsg = systemTemplate.format({ persona: 'pirate', style: 'dramatic' })
  const humanMsg = humanTemplate.format({ question: 'What is the weather today?' })

  console.log('System message role:', systemMsg.role)
  console.log('Human message role:', humanMsg.role)

  const pirateReply = await llm.call([systemMsg, humanMsg])
  console.log('Pirate reply:', pirateReply.content)
}

main().catch(console.error)
