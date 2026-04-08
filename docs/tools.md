# Tools Reference

Tools are the action capabilities available to agents. Each tool has a `name` that the agent uses to invoke it, a `description` the LLM reads to decide when to use it, and a `call()` method that performs the actual work.

## BaseTool

All tools extend `BaseTool`:

```typescript
abstract class BaseTool {
  abstract name: string          // Tool identifier used by the agent
  abstract description: string   // Explain to the LLM when and how to use the tool

  constructor(config: BaseToolConfig)

  // Implement this in your subclass
  abstract call(input: string): Promise<ToolResult>

  // Runs the tool, fires callbacks, handles errors
  run(input: string, callbacks?: CallbackHandler[]): Promise<string>

  // Returns the tool's JSON schema for function-calling APIs
  toSchema(): Record<string, unknown>
}

interface BaseToolConfig {
  callbacks?: CallbackHandler[]
  verbose?: boolean
  returnDirect?: boolean  // If true, the agent returns this output immediately
}

interface ToolResult {
  output: string                     // The string result returned to the agent
  error?: string                     // Set to indicate a failure condition
  metadata?: Record<string, unknown> // Optional extra data (not shown to the LLM)
}
```

---

## CalculatorTool

Evaluates mathematical expressions safely using a sandboxed `Function` constructor. No network access, no file access.

```typescript
import { CalculatorTool } from 'fireworks-plus-plus'

const calc = new CalculatorTool({ verbose: false })

// Basic arithmetic
console.log(await calc.run('2 + 2'))           // "4"
console.log(await calc.run('(10 + 5) * 3'))    // "45"
console.log(await calc.run('100 / 4 - 7'))     // "18"

// Exponentiation
console.log(await calc.run('2 ** 10'))         // "1024"

// Math functions
console.log(await calc.run('sqrt(256)'))        // "16"
console.log(await calc.run('abs(-42)'))         // "42"
console.log(await calc.run('pow(3, 4)'))        // "81"
console.log(await calc.run('log(E)'))           // "1"
console.log(await calc.run('round(3.7)'))       // "4"
console.log(await calc.run('floor(3.9)'))       // "3"
console.log(await calc.run('ceil(3.1)'))        // "4"
console.log(await calc.run('min(5, 3, 8, 1)')) // "1"
console.log(await calc.run('max(5, 3, 8, 1)')) // "8"

// Constants
console.log(await calc.run('PI * 5 ** 2'))     // "78.5398163397"
console.log(await calc.run('E ** 2'))          // "7.3890560989"

// Trigonometry
console.log(await calc.run('sin(PI / 2)'))     // "1"
console.log(await calc.run('cos(0)'))          // "1"
```

**Supported operations:** `+`, `-`, `*`, `/`, `**` (power), `%` (modulo), grouping `(`, `)`, and all `Math.*` functions listed above plus `log2`, `log10`, `tan`.

**Security note:** The expression is evaluated in a restricted scope with only Math functions available. Arbitrary code execution is not possible.

---

## ResearchTool

Fetches factual information from Wikipedia's public REST API. Uses the summary endpoint first, falling back to opensearch for disambiguation.

```typescript
import { ResearchTool } from 'fireworks-plus-plus'

const research = new ResearchTool({
  maxResults: 3,   // Number of fallback search results
  language: 'en'  // Wikipedia language code: 'en', 'fr', 'de', 'es', etc.
})

// Single topic lookup
const result = await research.run('Eiffel Tower')
console.log(result)
// "**Eiffel Tower**
//  *wrought-iron lattice tower on the Champ de Mars in Paris*
//
//  The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris...
//  Source: https://en.wikipedia.org/wiki/Eiffel_Tower"

// Search with multiple results
const results = await research.run('machine learning neural network')
```

**Notes:**
- Uses `fetch` only — no API key required.
- Results may vary depending on Wikipedia content at call time.
- For more controlled research, combine with `BrowserTool` and a specific URL.

---

## BrowserTool

Navigates to a URL and returns the page's text content.

```typescript
import { BrowserTool } from 'fireworks-plus-plus'

const browser = new BrowserTool({
  timeout: 15_000,                   // Request timeout in milliseconds
  userAgent: 'Fireworks++/0.1.0'  // User-agent header
})

// Fetch a web page
const content = await browser.run('https://example.com')
console.log(content.slice(0, 500))
```

**Use cases:**
- Fetching a specific web page the agent knows about
- Web scraping structured content
- Checking if a URL is accessible

**Limitations:** Does not execute JavaScript. For JavaScript-heavy pages, consider a headless browser integration.

---

## SSHTool

Executes commands on a remote server via SSH. Requires SSH access credentials.

```typescript
import { SSHTool } from 'fireworks-plus-plus'

const ssh = new SSHTool({
  connection: {
    host: '192.168.1.100',
    port: 22,
    username: 'deploy',
    privateKeyPath: '~/.ssh/id_rsa',    // Path to private key file
    // OR:
    password: 'your-password'            // Password auth (less secure)
  },
  timeout: 30_000  // Command execution timeout
})

// Run a command
const output = await ssh.run('df -h')
console.log(output)

// Run multiple commands
const result = await ssh.run('cd /var/www && ls -la')
```

**Safety recommendation:** Always run `SafetyPolicy.check()` on user-provided commands before passing them to `SSHTool`.

**Config:**

```typescript
interface SSHConnectionConfig {
  host: string
  port?: number         // Default: 22
  username: string
  privateKeyPath?: string
  password?: string
  passphrase?: string   // For encrypted private keys
}

interface SSHToolConfig extends BaseToolConfig {
  connection: SSHConnectionConfig
  timeout?: number      // Default: 30000
}
```

---

## DocumentTool

Generates documents in multiple formats: plain text, Markdown, HTML, JSON, and CSV.

```typescript
import { DocumentTool } from 'fireworks-plus-plus'

const docTool = new DocumentTool({
  outputDir: './output',
  defaultFormat: 'md'  // 'txt' | 'md' | 'html' | 'json' | 'csv'
})

// The agent passes JSON with filename and content
const input = JSON.stringify({
  filename: 'quarterly-report',
  title: 'Q1 2026 Report',
  content: '# Q1 2026 Report\n\n## Summary\n\nSales increased by 12%...'
})

const result = await docTool.run(input)
console.log(result) // "Document saved to ./output/quarterly-report.md"
```

**Config:**

```typescript
type DocumentFormat = 'txt' | 'md' | 'html' | 'json' | 'csv'

interface DocumentToolConfig extends BaseToolConfig {
  outputDir?: string    // Default: './output'
  defaultFormat?: DocumentFormat // Default: 'md'
}
```

---

## EditorTool

Reads, writes, appends, patches, or opens files inside a workspace. By default it is read/write only; set `openInEditor: true` to launch the system editor.

```typescript
import { EditorTool } from 'fireworks-plus-plus'

const editor = new EditorTool({
  workspacePath: process.cwd(),
  openInEditor: true,
  editor: 'code'
})

// Read a file
await editor.run(JSON.stringify({ action: 'read', path: 'src/index.ts' }))

// Write a file
await editor.run(JSON.stringify({
  action: 'write',
  path: 'notes/todo.md',
  content: '# TODO\n'
}))

// Open a file in the editor
await editor.run(JSON.stringify({ action: 'open', path: 'src/index.ts', line: 10 }))
```

**Config:**

```typescript
interface EditorToolConfig extends BaseToolConfig {
  workspacePath?: string  // Default: process.cwd()
  openInEditor?: boolean  // Default: false
  editor?: string         // Default: process.env.EDITOR ?? 'code'
}
```

---

## DynamicTool

Create a fully functional tool from any async function without subclassing `BaseTool`.

```typescript
import { DynamicTool } from 'fireworks-plus-plus'
import type { ToolResult } from 'fireworks-plus-plus'

// Simple tool from a function
const greetingTool = new DynamicTool({
  name: 'greeting',
  description: 'Greet a person by name. Input: the person\'s name.',
  func: async (name: string): Promise<ToolResult> => ({
    output: `Hello, ${name.trim()}! Welcome to Fireworks++.`
  })
})

// Tool with error handling
const dividerTool = new DynamicTool({
  name: 'divide',
  description: 'Divide two numbers. Input: "numerator / denominator" e.g. "10 / 2"',
  func: async (input: string): Promise<ToolResult> => {
    const parts = input.split('/')
    if (parts.length !== 2) {
      return { output: 'Invalid format. Use: numerator / denominator', error: 'Bad input' }
    }
    const a = parseFloat(parts[0].trim())
    const b = parseFloat(parts[1].trim())
    if (b === 0) {
      return { output: 'Division by zero is undefined.', error: 'Division by zero' }
    }
    return { output: String(a / b) }
  },
  verbose: true
})

// Wrapping an external API
const currencyTool = new DynamicTool({
  name: 'currency_converter',
  description: 'Convert currency. Input: "<amount> <FROM> to <TO>" e.g. "100 USD to EUR"',
  func: async (input: string): Promise<ToolResult> => {
    // Parse input
    const match = input.match(/^([\d.]+)\s+(\w+)\s+to\s+(\w+)$/i)
    if (!match) return { output: 'Invalid format.', error: 'Parse error' }
    const [, amountStr, from, to] = match
    const amount = parseFloat(amountStr)

    // Call exchange rate API (example)
    const response = await fetch(`https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`)
    const data = await response.json() as { result?: number }
    if (!data.result) return { output: 'Could not fetch exchange rate.', error: 'API error' }

    return {
      output: `${amount} ${from} = ${data.result.toFixed(2)} ${to}`,
      metadata: { from, to, amount, result: data.result }
    }
  }
})
```

---

## Tool Callbacks and Verbose Logging

Every tool fires `onToolStart`, `onToolEnd`, and `onToolError` on its registered callbacks. Set `verbose: true` to also log to the console.

```typescript
import { LoggingCallbackHandler, CalculatorTool } from 'fireworks-plus-plus'

const logger = new LoggingCallbackHandler({ level: 'info', prefix: '[MyAgent]' })

const calc = new CalculatorTool({
  verbose: true,
  callbacks: [logger]
})

await calc.run('42 * 1000')
// [Tool:calculator] Input: 42 * 1000
// [MyAgent] [TOOL:START] tool="calculator" input="42 * 1000"
// [Tool:calculator] Output: 42000
// [MyAgent] [TOOL:END]   output="42000"
```

---

## Tool Schema for Function Calling

Each tool exposes a schema compatible with OpenAI and Anthropic function-calling formats:

```typescript
const research = new ResearchTool()
console.log(JSON.stringify(research.toSchema(), null, 2))
// {
//   "name": "research",
//   "description": "Research topics using Wikipedia...",
//   "parameters": {
//     "type": "object",
//     "properties": {
//       "input": {
//         "type": "string",
//         "description": "The input to the tool"
//       }
//     },
//     "required": ["input"]
//   }
// }
```
