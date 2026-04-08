# Agents and Tools

Agents are autonomous decision-making loops that use an LLM to decide which tools to invoke, in what order, and when to stop. Unlike chains, which execute a predetermined sequence of steps, an agent reasons dynamically at each step.

## The ReAct Pattern

Fireworks++ uses the **ReAct** (Reasoning + Acting) pattern:

1. The agent is given a task and a list of available tools.
2. The LLM generates a **Thought** (reasoning about what to do) and an **Action** (which tool to use with what input).
3. The tool is executed, producing an **Observation**.
4. The thought/action/observation cycle repeats until the LLM generates a **Final Answer**.

```
Task: What is the population of Tokyo divided by 1000?

Thought: I need to find Tokyo's population, then divide it.
Action: research[Tokyo population]
Observation: Tokyo's population is approximately 13.96 million.

Thought: Now I need to divide 13,960,000 by 1000.
Action: calculator[13960000 / 1000]
Observation: 13960

Thought: I have the answer.
Final Answer: Tokyo's population divided by 1000 is 13,960.
```

---

## Creating an Agent

Fireworks++ provides both a native tool-calling agent loop and a ReAct agent loop.

### ToolCallingAgent

For models with native tool calling, prefer `ToolCallingAgent` and `ToolCallingAgentExecutor`:

```typescript
import {
  ChatOpenAI,
  ToolCallingAgent,
  ToolCallingAgentExecutor,
  DynamicTool
} from 'fireworks-plus-plus'

const llm = new ChatOpenAI({ apiKey: process.env.OPENAI_API_KEY })

const weatherTool = new DynamicTool({
  name: 'get_weather',
  description: 'Get the current weather for a city. Input should be the city name.',
  func: async (input) => ({ output: `Sunny in ${input}` })
})

const agent = new ToolCallingAgent(llm, [weatherTool], {
  systemPrompt: 'Use tools whenever they help you answer accurately.'
})

const executor = new ToolCallingAgentExecutor(agent, {
  maxIterations: 8,
  returnIntermediateSteps: true
})

const result = await executor.call({
  input: 'What is the weather in Tokyo?'
})

console.log(result.output)
```

`ToolCallingAgent` wraps a chat model that supports native tool calling and delegates turns to the provider-native `callWithTools()` API. `ToolCallingAgentExecutor` runs the loop, executes one or more tool calls per turn, appends tool results, and continues until the model responds with a final answer.

`ToolCallingAgentExecutor` also supports resumable checkpointing through `InMemoryCheckpointStore` and `FileCheckpointStore`. See [Checkpoints](./checkpoints.md) for the full durability flow.

For risky tools, it can also pause in a `waiting_for_approval` state before execution and resume only after an explicit approve/reject decision.

Use this agent family for `ChatOpenAI` and `ChatAnthropic`. Use `ReActAgent` when you need a text-based, provider-agnostic fallback.

### ReActAgent

Fireworks++ also provides `ReActAgent` and `AgentExecutor`:

```typescript
import {
  ChatAnthropic,
  ReActAgent,
  AgentExecutor,
  ResearchTool,
  CalculatorTool,
  DynamicTool
} from 'fireworks-plus-plus'
import type { ToolResult } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ model: 'claude-3-5-sonnet-20241022' })

const tools = [
  new ResearchTool({ maxResults: 3 }),
  new CalculatorTool(),
  new DynamicTool({
    name: 'current_date',
    description: 'Returns today\'s date in YYYY-MM-DD format. No input needed.',
    func: async (): Promise<ToolResult> => ({
      output: new Date().toISOString().slice(0, 10)
    })
  })
]

// Create the agent — it builds the ReAct system prompt from the tool list automatically
const agent = new ReActAgent(llm, tools)

// The executor manages the Thought→Action→Observation loop
const executor = new AgentExecutor(agent, tools, {
  maxIterations: 10,
  verbose: true,
  returnIntermediateSteps: true
})

// Simple string input, string output
const answer = await executor.run(
  'Research the Eiffel Tower and tell me the year it was completed divided by 100.'
)
console.log(answer)
```

`ReActAgent` wraps a chat model and a list of tools. It builds a system prompt that describes the ReAct format to the LLM, sends the conversation history on each iteration, and parses the LLM output into either an `AgentAction` (tool call) or an `AgentFinish` (final answer).

```typescript
new ReActAgent(
  llm: BaseChatModel,
  tools: BaseTool[],
  memory?: BaseMemory,     // Optional — inject conversation history
  systemPrompt?: string    // Optional — prepended to the ReAct system template
)
```

### AgentExecutor

`AgentExecutor` drives the loop: it calls `agent.plan()`, executes the returned tool action, feeds back the observation, and repeats until the agent signals `AgentFinish` or the iteration limit is reached.

```typescript
new AgentExecutor(
  agent: BaseAgent,
  tools: BaseTool[],
  options?: ExecutorOptions
)
```

**ExecutorOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxIterations` | `number` | `15` | Maximum Thought→Action→Observation cycles |
| `returnIntermediateSteps` | `boolean` | `false` | Include all steps in the returned ChainValues |
| `earlyStoppingMethod` | `"force" \| "generate"` | `"force"` | On max iterations: force-stop or ask the LLM for a final answer |
| `handleParsingErrors` | `boolean` | `true` | Recover from malformed LLM output by injecting an error observation |
| `verbose` | `boolean` | `false` | Log each step to the console |

**Methods:**

```typescript
// With structured input/output (includes intermediateSteps if enabled)
call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues>

// Convenience: string in, string out
run(input: string, callbacks?: CallbackHandler[]): Promise<string>
```

For tool-calling executors with checkpointing enabled:

```typescript
resume(threadId: string, callbacks?: CallbackHandler[]): Promise<ChainValues>
resumeFromCheckpoint(checkpointId: string, callbacks?: CallbackHandler[]): Promise<ChainValues>
approve(threadId: string, decision?: ApprovalDecision): Promise<ChainValues>
approveCheckpoint(checkpointId: string, decision?: ApprovalDecision): Promise<ChainValues>
reject(threadId: string, decision?: ApprovalDecision): Promise<ChainValues>
rejectCheckpoint(checkpointId: string, decision?: ApprovalDecision): Promise<ChainValues>
```

### Accessing Intermediate Steps

```typescript
const result = await executor.call(
  { input: 'What is the population of Paris?' },
  [myLogger]
)

console.log(result['output']) // Final answer

const steps = result['intermediateSteps'] as Array<[AgentAction, string]>
steps.forEach(([action, observation], i) => {
  console.log(`Step ${i + 1}: ${action.tool}("${action.toolInput}")`)
  console.log(`  Observation: ${observation.slice(0, 100)}`)
})
```

---

## Tools

Tools are the capabilities your agent can call. Every tool extends `BaseTool`:

```typescript
abstract class BaseTool {
  abstract name: string
  abstract description: string
  abstract call(input: string): Promise<ToolResult>
  run(input: string, callbacks?: CallbackHandler[]): Promise<string>
  toSchema(): Record<string, unknown>
}
```

### Built-in Tools

#### ResearchTool

Fetches information from Wikipedia's REST API.

```typescript
import { ResearchTool } from 'fireworks-plus-plus'

const tool = new ResearchTool({
  maxResults: 3,    // Max search results for fallback search
  language: 'en'   // Wikipedia language code
})

const result = await tool.run('Mount Everest height')
console.log(result)
```

#### CalculatorTool

Evaluates mathematical expressions safely.

```typescript
import { CalculatorTool } from 'fireworks-plus-plus'

const calc = new CalculatorTool()

console.log(await calc.run('(2 + 3) * 4 / 2'))       // "10"
console.log(await calc.run('sqrt(144) + pow(2, 10)')) // "1036"
console.log(await calc.run('PI * 5 ** 2'))            // "78.5398163397"
```

Supported: `+`, `-`, `*`, `/`, `**`, `%`, `(`, `)`, `sqrt`, `abs`, `pow`, `log`, `log2`, `log10`, `sin`, `cos`, `tan`, `floor`, `ceil`, `round`, `min`, `max`, `PI`, `E`.

#### BrowserTool

Navigates to URLs and returns page content.

```typescript
import { BrowserTool } from 'fireworks-plus-plus'

const browser = new BrowserTool({
  timeout: 10_000,
  userAgent: 'Fireworks++/0.1.0'
})

const content = await browser.run('https://example.com')
```

#### SSHTool

Executes commands on a remote server via SSH.

```typescript
import { SSHTool } from 'fireworks-plus-plus'

const ssh = new SSHTool({
  connection: {
    host: '192.168.1.100',
    port: 22,
    username: 'deploy',
    privateKeyPath: '~/.ssh/id_rsa'
  }
})

const result = await ssh.run('ls -la /var/www')
console.log(result)
```

#### DocumentTool

Generates documents in various formats.

```typescript
import { DocumentTool } from 'fireworks-plus-plus'

const docTool = new DocumentTool({
  outputDir: './output',
  defaultFormat: 'md' // or 'txt', 'html', 'json', 'csv'
})

await docTool.run(JSON.stringify({
  filename: 'report',
  content: '# Q1 Report\n\nSales increased by 12%...'
}))
```

#### EditorTool

Reads, writes, patches, and optionally opens files in an editor.

```typescript
import { EditorTool } from 'fireworks-plus-plus'

const editor = new EditorTool({
  workspacePath: process.cwd(),
  openInEditor: true,
  editor: 'code'
})

await editor.run(JSON.stringify({ action: 'open', path: 'src/index.ts', line: 42 }))
```

### DynamicTool

Create a tool from any async function:

```typescript
import { DynamicTool } from 'fireworks-plus-plus'
import type { ToolResult } from 'fireworks-plus-plus'

const weatherTool = new DynamicTool({
  name: 'get_weather',
  description: 'Get current weather for a city. Input: city name.',
  func: async (city: string): Promise<ToolResult> => {
    // Call your weather API here
    const data = await fetchWeather(city)
    return {
      output: `${data.temp}°C, ${data.description} in ${city}`,
      metadata: { city, ...data }
    }
  },
  verbose: true
})
```

### Creating Custom Tools

Extend `BaseTool` for full control:

```typescript
import { BaseTool } from 'fireworks-plus-plus'
import type { ToolResult, BaseToolConfig } from 'fireworks-plus-plus'

interface DatabaseToolConfig extends BaseToolConfig {
  connectionString: string
}

export class DatabaseTool extends BaseTool {
  name = 'database_query'
  description = 'Run a read-only SQL query. Input: SQL SELECT statement.'

  private connectionString: string

  constructor(config: DatabaseToolConfig) {
    super(config)
    this.connectionString = config.connectionString
  }

  async call(input: string): Promise<ToolResult> {
    // Validate it's a SELECT
    if (!input.trim().toUpperCase().startsWith('SELECT')) {
      return {
        output: 'Error: Only SELECT queries are allowed.',
        error: 'Non-SELECT query rejected'
      }
    }

    try {
      const rows = await runQuery(this.connectionString, input)
      return {
        output: JSON.stringify(rows, null, 2),
        metadata: { rowCount: rows.length }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { output: `Query error: ${message}`, error: message }
    }
  }
}
```

---

## Tool Schema

Tools expose a schema for use with LLM function-calling APIs:

```typescript
const calc = new CalculatorTool()
console.log(calc.toSchema())
// {
//   name: "calculator",
//   description: "Useful for evaluating mathematical expressions...",
//   parameters: {
//     type: "object",
//     properties: {
//       input: { type: "string", description: "The input to the tool" }
//     },
//     required: ["input"]
//   }
// }
```

---

## Verbose Mode and Callbacks

All tools support `verbose` logging and lifecycle callbacks:

```typescript
import { LoggingCallbackHandler, ResearchTool } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'info' })

const tool = new ResearchTool({
  verbose: true,
  callbacks: [logger]
})

await tool.run('Newton laws of motion')
// [Tool:research] Input: Newton laws of motion
// [Fireworks++] [TOOL:START] tool="research" input="Newton laws of motion"
// [Tool:research] Output: **Newton's laws of motion**...
// [Fireworks++] [TOOL:END]   output="**Newton's laws of motion**..."
```

---

## Safety Before Tool Use

Always check inputs with `SafetyPolicy` before handing them to tools:

```typescript
import { SafetyPolicy, SSHTool } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const ssh = new SSHTool({ connection: sshConfig })

async function safeSSH(command: string): Promise<string> {
  const check = policy.check(command)
  if (!check.allowed) {
    return `Command blocked: ${check.reason}`
  }
  return ssh.run(command)
}
```

---

## Multi-Step Planning

For tasks that require decomposition before execution, you can combine LLM planning with tool execution:

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic()

// Step 1: Plan
const planPrompt = PromptTemplate.fromTemplate(
  'Break this task into numbered steps, one per line. Task: {task}'
)
const planChain = new LLMChain(llm, planPrompt, { outputKey: 'plan' })

// Step 2: Execute each step
async function executeWithPlan(task: string): Promise<void> {
  const { plan } = await planChain.call({ task })
  const steps = String(plan).split('\n').filter(s => s.trim())

  console.log(`Executing ${steps.length} steps:`)
  for (const step of steps) {
    console.log(`\n>> ${step}`)
    // Execute each step through your agent or tool directly
    const result = await llm.call([
      { role: 'system', content: 'Execute this step concisely.' },
      { role: 'human', content: step }
    ])
    console.log(result.content)
  }
}

await executeWithPlan('Research the history of the internet and write a summary.')
```
