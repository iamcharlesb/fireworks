/**
 * Example 04: RouterChain
 *
 * Demonstrates:
 * - HeuristicRouter standalone usage
 * - IntentRouter with LLM fallback
 * - RouterChain dispatching to multiple destination chains
 * - MultiRouteChain with confidence and reasoning in output
 * - Manual routing without chains
 */
import {
  ChatAnthropic,
  LLMChain,
  RouterChain,
  MultiRouteChain,
  HeuristicRouter,
  IntentRouter,
  CalculatorTool,
  ResearchTool,
  PromptTemplate
} from '../src'

async function main() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.3
  })

  // ── HeuristicRouter standalone ────────────────────────────────────────────
  console.log('=== HeuristicRouter ===')

  const heuristic = new HeuristicRouter()

  const queries = [
    'What is 42 * 1000?',
    'SSH into root@192.168.1.100',
    'Tell me about the Great Wall of China',
    'Open https://github.com in the browser',
    'Create a PDF report about sales',
    'What is the meaning of life?'
  ]

  for (const query of queries) {
    const decision = heuristic.route(query)
    console.log(`  "${query.slice(0, 45)}"`)
    console.log(`    => ${decision.kind} (confidence: ${decision.confidence.toFixed(2)})`)
  }
  console.log()

  // ── IntentRouter with LLM fallback ────────────────────────────────────────
  console.log('=== IntentRouter (with LLM fallback) ===')

  const intentRouter = new IntentRouter(llm, {
    confidenceThreshold: 0.8,  // Use LLM when heuristic score < 0.8
    timeout: 10_000
  })

  const ambiguousInputs = [
    'Can you help me draft a proposal?',
    'I need to check something on a server',
    'What does 15% of 340 equal?'
  ]

  for (const input of ambiguousInputs) {
    const decision = await intentRouter.route(input)
    console.log(`  "${input}"`)
    console.log(`    => ${decision.kind} (${decision.confidence.toFixed(2)}) — ${decision.reasoning ?? ''}`)
  }
  console.log()

  // ── RouterChain ───────────────────────────────────────────────────────────
  console.log('=== RouterChain ===')

  // Build destination chains
  const mathChain = new LLMChain(
    llm,
    PromptTemplate.fromTemplate(
      'Solve this step by step and give the final numerical answer: {input}'
    )
  )

  const researchChain = new LLMChain(
    llm,
    PromptTemplate.fromTemplate(
      'Provide a concise, factual answer (2-3 sentences) about: {input}'
    )
  )

  const documentChain = new LLMChain(
    llm,
    PromptTemplate.fromTemplate(
      'Create a brief outline for a document about: {input}'
    )
  )

  const defaultChain = new LLMChain(
    llm,
    PromptTemplate.fromTemplate(
      'Answer this helpfully and concisely: {input}'
    )
  )

  const router = new RouterChain(
    intentRouter,
    {
      calculator: mathChain,
      research: researchChain,
      document: documentChain
    },
    defaultChain,
    { verbose: true }
  )

  const routerInputs = [
    'What is the square root of 1764?',
    'Who invented the World Wide Web?',
    'How are you doing today?'
  ]

  for (const input of routerInputs) {
    console.log(`\nInput: "${input}"`)
    const result = await router.call({ input })
    console.log(`Routed to: ${String(result['destination'])}`)
    console.log(`Answer: ${String(result['output']).slice(0, 150)}`)
  }
  console.log()

  // ── MultiRouteChain ───────────────────────────────────────────────────────
  console.log('=== MultiRouteChain ===')

  const multiRouter = new MultiRouteChain(
    intentRouter,
    {
      calculator: mathChain,
      research: researchChain
    },
    defaultChain
  )

  const multiResult = await multiRouter.call({
    input: 'What is the approximate population of Earth in billions?'
  })

  console.log('Destination:', multiResult['destination'])
  console.log('Confidence:', (multiResult['confidence'] as number).toFixed(3))
  console.log('Reasoning:', multiResult['reasoning'])
  console.log('Answer:', String(multiResult['output']).slice(0, 200))
  console.log()

  // ── Manual tool-based routing ─────────────────────────────────────────────
  console.log('=== Manual routing to tools ===')

  const calc = new CalculatorTool()
  const research = new ResearchTool({ maxResults: 2 })
  const fastRouter = new HeuristicRouter()

  async function dispatchToTool(input: string): Promise<string> {
    const { kind, confidence } = fastRouter.route(input)
    console.log(`  Routing "${input.slice(0, 50)}" → ${kind} (${confidence.toFixed(2)})`)

    switch (kind) {
      case 'calculator': {
        // Extract the math expression
        const expr = input.replace(/[^0-9+\-*/%.()^sqrt\s]/gi, '').trim() || input
        return calc.run(expr)
      }
      case 'research': {
        // Use the full query as the research topic
        return research.run(input)
      }
      default: {
        const reply = await llm.call([{ role: 'human', content: input }])
        return reply.content
      }
    }
  }

  const toolInputs = [
    'sqrt(196)',
    'Eiffel Tower',
    'What is a good name for a cat?'
  ]

  for (const input of toolInputs) {
    const result = await dispatchToTool(input)
    console.log(`  Result: ${result.slice(0, 120)}`)
    console.log()
  }
}

main().catch(console.error)
