# Fireworks++

> A TypeScript-first agentic AI framework — Build LLM-powered applications with composable chains, agents, tools, and memory.

## What is Fireworks++?

Fireworks++ is an open-source TypeScript framework for building applications powered by large language models (LLMs). It provides a clean, composable architecture for creating everything from simple chatbots to complex autonomous agents that interact with the real world.

- **Provider Abstraction** — Unified API for Anthropic, OpenAI, Gemini, Perplexity, and Ollama
- **Gemini Support** — Native Google Gemini chat and text wrappers with tool calling and structured output
- **Native Tool Calling** — Provider-native tool/function calling for OpenAI and Anthropic chat models
- **Native Tool Agents** — Tool-calling agent loop built on provider-native tool use
- **Structured Output** — JSON-schema structured output helpers for OpenAI and Anthropic
- **Tracing and Costing** — In-memory traces and approximate token/cost accounting
- **Evaluations** — Lightweight dataset runners with built-in exact-match and contains evaluators
- **Checkpointing** — Resume tool-calling agent runs from in-memory or file-backed state
- **Human Approval** — Pause risky tool calls, approve or reject them, and resume from checkpoints
- **CLI** — Scaffold projects, inspect audit logs, and summarize checkpoints/workflows locally
- **Governance Controls** — RBAC, policies, budgets, and audit logging for agents and workflows
- **Monitoring Dashboard** — Generate local dashboards and alert summaries from runtime artifacts
- **Management Server** — Self-hosted HTTP server for dashboards, alerts, and operational APIs
- **Plugins and Connectors** — Extensible plugin registry plus webhook, Datadog, Splunk, Kafka, and REST connectors
- **Simple Facade** — `createAgent()` API for fast adoption with a clean upgrade path to the advanced runtime
- **MCP Support** — First-class MCP client and server support for tools, resources, and prompts
- **Workflow Graphs** — Conditional graph execution with branching state and resumable workflow checkpoints
- **Composable Chains** — LLMChain, SequentialChain, RouterChain, TransformChain
- **Intelligent Agents** — ReAct agents with tool use and multi-step planning
- **Built-in Tools** — SSH, Browser, Research, Document generation, Editor, Calculator
- **Memory Systems** — Buffer, Window, Summary, and Thread-based conversation memory
- **Intent Routing** — Heuristic and LLM-based request routing
- **Safety Policies** — Content filtering before execution
- **Output Parsers** — JSON, Structured, and List parsers
- **Document Loaders** — Text, JSON, and CSV loading with split support
- **Retrievers** — Vector-store retrievers for reusable RAG pipelines
- **Vector Stores** — In-memory semantic search with cosine similarity
- **Streaming** — Token-level streaming with callback handlers
- **Full TypeScript** — Strict typing throughout, excellent IDE support

## Installation

```bash
npm install fireworks-plus-plus
# or
yarn add fireworks-plus-plus
```

No required runtime dependencies. API keys are passed via config or environment variables.

## Quick Start

### Basic Chat

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022'
})

const reply = await llm.call([
  { role: 'human', content: 'What is the capital of France?' }
])
console.log(reply.content) // "The capital of France is Paris."
```

### LLM Chain

```typescript
import { ChatAnthropic, LLMChain, PromptTemplate } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const prompt = PromptTemplate.fromTemplate('Tell me a {adjective} joke about {topic}')
const chain = new LLMChain(llm, prompt)

const result = await chain.run({ adjective: 'funny', topic: 'programmers' })
console.log(result)
```

### Conversation with Memory

```typescript
import { ChatAnthropic, ConversationBufferMemory } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const memory = new ConversationBufferMemory()

async function chat(userInput: string): Promise<string> {
  const vars = await memory.loadMemoryVariables()
  const history = vars['history'] as string

  const messages = []
  if (history) {
    messages.push({ role: 'system' as const, content: `Conversation so far:\n${history}` })
  }
  messages.push({ role: 'human' as const, content: userInput })

  const reply = await llm.call(messages)
  await memory.saveContext({ input: userInput }, { output: reply.content })
  return reply.content
}

await chat('My name is Alice.')
const response = await chat('What is my name?')
console.log(response) // "Your name is Alice."
```

### Semantic Search (RAG)

```typescript
import {
  InMemoryVectorStore,
  FakeEmbeddings,
  TextLoader,
  VectorStoreRetriever
} from 'fireworks-plus-plus'

const loader = new TextLoader('./my-document.txt')
const docs = await loader.load()

const store = await InMemoryVectorStore.fromDocuments(docs, new FakeEmbeddings())
const retriever = new VectorStoreRetriever(store, { k: 3 })
const results = await retriever.getRelevantDocuments('key concepts')
results.forEach(r => console.log(r.pageContent))
```

### Streaming

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'

const llm = new ChatAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

await llm.stream(
  [{ role: 'human', content: 'Write a haiku about TypeScript.' }],
  (chunk) => {
    if (!chunk.isFinal) process.stdout.write(chunk.text)
  }
)
```

### Intent Routing

```typescript
import { IntentRouter, HeuristicRouter } from 'fireworks-plus-plus'

const router = new IntentRouter()
const decision = await router.route('Calculate 42 * 7 + 100')
console.log(decision.kind)       // "calculator"
console.log(decision.confidence) // 0.92
```

### Safety Policy

```typescript
import { SafetyPolicy } from 'fireworks-plus-plus'

const policy = new SafetyPolicy()
const result = policy.check(userInput)
if (!result.allowed) {
  console.error('Blocked:', result.reason)
}
```

## Modules

```
Fireworks++
├── schema/          Core types and interfaces
├── llms/            Text completion: Anthropic, OpenAI, Gemini, Perplexity, Ollama
├── chat_models/     Chat models: ChatAnthropic, ChatOpenAI, ChatGemini, ChatPerplexity, ChatOllama
├── prompts/         PromptTemplate, ChatPromptTemplate, FewShotPromptTemplate
├── chains/          LLMChain, SequentialChain, RouterChain, TransformChain
├── tools/           ResearchTool, CalculatorTool, BrowserTool, SSHTool, DocumentTool, EditorTool
├── memory/          Buffer, Window, Summary, ThreadedMemory
├── output_parsers/  JsonOutputParser, StructuredOutputParser, list parsers
├── document_loaders/ TextLoader, BaseDocumentLoader
├── embeddings/      BaseEmbeddings, FakeEmbeddings, OpenAIEmbeddings
├── retrievers/      BaseRetriever, VectorStoreRetriever
├── vectorstores/    InMemoryVectorStore
├── callbacks/       Logging, Streaming, Tracing, CostTracking handlers
├── evaluations/     Dataset runners and built-in evaluators
├── checkpoints/     In-memory and file-backed runtime checkpoints
├── governance/      RBAC, policies, budgets, and audit logging
├── auth/            Bearer auth and SAML-style attribute mapping
├── plugins/         Plugin registry for tools, loaders, workflow nodes, callbacks
├── integrations/    Webhook, Datadog, Splunk, Kafka, and REST connectors
├── mcp/             Model Context Protocol client/server support
├── monitoring/      Snapshot loading, alert rules, and static dashboard rendering
├── simple/          High-level createAgent facade
├── server/          Self-hosted management API server
├── workflows/       Workflow graphs, branching state, and workflow executors
├── routing/         HeuristicRouter, IntentRouter
└── safety/          SafetyPolicy
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Core Concepts](./docs/concepts.md)
- [LLMs and Chat Models](./docs/llms.md)
- [Chains](./docs/chains.md)
- [Agents and Tools](./docs/agents.md)
- [Tools Reference](./docs/tools.md)
- [Memory](./docs/memory.md)
- [Output Parsers](./docs/output-parsers.md)
- [Document Loaders and Text Splitters](./docs/document-loaders.md)
- [Vector Stores](./docs/vector-stores.md)
- [Callbacks](./docs/callbacks.md)
- [CLI](./docs/cli.md)
- [Checkpoints](./docs/checkpoints.md)
- [Evaluations](./docs/evaluations.md)
- [Governance](./docs/governance.md)
- [Simple API](./docs/simple-api.md)
- [MCP](./docs/mcp.md)
- [Auth](./docs/auth.md)
- [Plugins](./docs/plugins.md)
- [Integrations](./docs/integrations.md)
- [Monitoring](./docs/monitoring.md)
- [Management Server](./docs/server.md)
- [Python SDK](./docs/python-sdk.md)
- [Workflows](./docs/workflows.md)
- [Intent Routing](./docs/routing.md)
- [Safety](./docs/safety.md)
- [API Reference](./docs/api-reference.md)

## Examples

See the [examples/](./examples/) directory for runnable TypeScript examples.

```bash
export ANTHROPIC_API_KEY=your-key
npx ts-node examples/01-basic-llm.ts
npx ts-node examples/17-governance-controls.ts
npx ts-node examples/18-monitoring-dashboard.ts
npx ts-node examples/19-plugins-and-connectors.ts
npx ts-node examples/20-management-server.ts
npx ts-node examples/21-simple-create-agent.ts
npx ts-node examples/22-mcp-client-server.ts
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0

## License

Apache 2.0 — see [LICENSE](./LICENSE)

## Author

Charles Barathidass
