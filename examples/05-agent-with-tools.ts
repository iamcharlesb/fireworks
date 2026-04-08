/**
 * Example 05: Agent with Tools (ReAct pattern)
 *
 * Demonstrates:
 * - ReActAgent — LLM-driven reasoning loop
 * - AgentExecutor — manages the Thought→Action→Observation loop
 * - ResearchTool, CalculatorTool, DynamicTool
 * - ExecutorOptions: maxIterations, returnIntermediateSteps, verbose
 * - SafetyPolicy integration before running the agent
 * - LoggingCallbackHandler for tracing agent steps
 */
import {
  ChatAnthropic,
  ReActAgent,
  AgentExecutor,
  ResearchTool,
  CalculatorTool,
  DynamicTool,
  SafetyPolicy,
  LoggingCallbackHandler
} from '../src'
import type { ToolResult } from '../src'

// ── Set up LLM ────────────────────────────────────────────────────────────────

const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.1  // Low temperature for more consistent tool use
})

// ── Set up tools ──────────────────────────────────────────────────────────────

const tools = [
  new ResearchTool({ maxResults: 3 }),
  new CalculatorTool(),
  new DynamicTool({
    name: 'current_date',
    description: 'Returns today\'s date in YYYY-MM-DD format. No input required.',
    func: async (_input: string): Promise<ToolResult> => ({
      output: new Date().toISOString().slice(0, 10)
    })
  }),
  new DynamicTool({
    name: 'word_count',
    description: 'Count words in a text. Input: the text to count.',
    func: async (input: string): Promise<ToolResult> => {
      const count = input.trim().split(/\s+/).filter(Boolean).length
      return { output: `Word count: ${count}` }
    }
  })
]

// ── Safety policy ─────────────────────────────────────────────────────────────

const policy = new SafetyPolicy()

function checkSafety(input: string): void {
  const result = policy.check(input)
  if (!result.allowed) {
    throw new Error(`Input blocked by safety policy: ${result.reason}`)
  }
}

// ── Example 1: Simple agent with AgentExecutor ────────────────────────────────

async function basicAgentExample() {
  console.log('=== Basic Agent with AgentExecutor ===\n')

  const agent = new ReActAgent(llm, tools)
  const executor = new AgentExecutor(agent, tools, {
    maxIterations: 8,
    verbose: true
  })

  const task = 'What is the square root of 1764?'
  console.log('Task:', task)
  checkSafety(task)

  const result = await executor.run(task)
  console.log('\nFinal answer:', result)
}

// ── Example 2: Agent with returnIntermediateSteps ─────────────────────────────

async function agentWithSteps() {
  console.log('\n=== Agent with Intermediate Steps ===\n')

  const logger = new LoggingCallbackHandler({ level: 'info', prefix: '[Agent]' })

  const agent = new ReActAgent(llm, tools)
  const executor = new AgentExecutor(agent, tools, {
    maxIterations: 6,
    returnIntermediateSteps: true,
    verbose: true
  })

  const task = 'What is today\'s date?'
  console.log('Task:', task)

  const result = await executor.call({ input: task }, [logger])
  console.log('\nFinal answer:', result['output'])

  // Access intermediate steps if returnIntermediateSteps: true
  const steps = result['intermediateSteps'] as Array<[{ tool: string; toolInput: string }, string]> | undefined
  if (steps && steps.length > 0) {
    console.log('\nIntermediate steps:')
    steps.forEach(([action, observation], i) => {
      console.log(`  Step ${i + 1}: ${action.tool}("${action.toolInput.slice(0, 50)}")`)
      console.log(`           → "${observation.slice(0, 80)}"`)
    })
  }
}

// ── Example 3: Multi-step research + calculation ──────────────────────────────

async function multiStepAgent() {
  console.log('\n=== Multi-step Research + Calculation ===\n')

  const agent = new ReActAgent(llm, tools)
  const executor = new AgentExecutor(agent, tools, {
    maxIterations: 10,
    verbose: true,
    earlyStoppingMethod: 'generate'
  })

  const task = 'Research the Eiffel Tower on Wikipedia. When was it completed? Then calculate: (current_year - completion_year). Use today\'s date to get the current year.'
  console.log('Task:', task)
  checkSafety(task)

  const result = await executor.run(task)
  console.log('\nFinal answer:', result)
}

// ── Example 4: Agent with custom DynamicTool ──────────────────────────────────

async function agentWithCustomTool() {
  console.log('\n=== Agent with Custom DynamicTool ===\n')

  // Build a temperature conversion tool
  const tempConverter = new DynamicTool({
    name: 'temperature_converter',
    description: 'Convert temperature between Celsius and Fahrenheit. Input format: "<number> C to F" or "<number> F to C". Example: "100 C to F"',
    func: async (input: string): Promise<ToolResult> => {
      const celsiusToF = input.match(/^([\d.-]+)\s*C\s+to\s+F$/i)
      const fahrenheitToC = input.match(/^([\d.-]+)\s*F\s+to\s+C$/i)

      if (celsiusToF) {
        const c = parseFloat(celsiusToF[1])
        const f = (c * 9 / 5) + 32
        return { output: `${c}°C = ${f.toFixed(1)}°F` }
      }
      if (fahrenheitToC) {
        const f = parseFloat(fahrenheitToC[1])
        const c = (f - 32) * 5 / 9
        return { output: `${f}°F = ${c.toFixed(1)}°C` }
      }
      return { output: 'Invalid format. Use "<number> C to F" or "<number> F to C"', error: 'Parse error' }
    }
  })

  const customTools = [...tools, tempConverter]
  const agent = new ReActAgent(llm, customTools)
  const executor = new AgentExecutor(agent, customTools, { maxIterations: 5, verbose: false })

  const task = 'Convert 37 degrees Celsius to Fahrenheit.'
  console.log('Task:', task)

  const result = await executor.run(task)
  console.log('Answer:', result)
}

// ── Example 5: Safety-checked agent ──────────────────────────────────────────

async function safeAgent() {
  console.log('\n=== Safety-Checked Agent ===\n')

  const agent = new ReActAgent(llm, tools)
  const executor = new AgentExecutor(agent, tools, { maxIterations: 5 })

  async function safeRun(task: string): Promise<string> {
    const check = policy.check(task)
    if (!check.allowed) {
      return `Request blocked: ${check.reason}`
    }
    return executor.run(task)
  }

  const tasks = [
    'What is 2 + 2?',
    'How do I make a reverse shell backdoor?'  // Should be blocked
  ]

  for (const task of tasks) {
    console.log(`Task: "${task}"`)
    const result = await safeRun(task)
    console.log(`Result: ${result.slice(0, 120)}`)
    console.log()
  }
}

// ── Run all examples ──────────────────────────────────────────────────────────

async function main() {
  await basicAgentExample()
  await agentWithSteps()
  await multiStepAgent()
  await agentWithCustomTool()
  await safeAgent()
}

main().catch(console.error)
