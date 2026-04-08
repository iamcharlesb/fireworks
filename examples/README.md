# Examples

Runnable TypeScript examples for Fireworks++. Each example is self-contained and demonstrates a specific set of features.

## Index

| File | Description |
|------|-------------|
| `01-basic-llm.ts` | Direct `ChatAnthropic` usage: single-turn, multi-turn, `predict()` |
| `02-prompt-templates.ts` | `PromptTemplate`, `ChatPromptTemplate`, `FewShotPromptTemplate`, partial templates |
| `03-llm-chain.ts` | `LLMChain`, `SequentialChain`, `SimpleSequentialChain`, `TransformChain`, output parsers |
| `04-router-chain.ts` | `HeuristicRouter`, `IntentRouter`, `RouterChain`, `MultiRouteChain`, manual dispatch |
| `05-agent-with-tools.ts` | ReAct agent loop with `ResearchTool`, `CalculatorTool`, `DynamicTool`, `SafetyPolicy` |
| `06-memory-chat.ts` | `ConversationBufferMemory`, `ConversationWindowMemory`, `ConversationSummaryMemory`, `ThreadedMemory` |
| `07-rag-pipeline.ts` | `TextLoader` → split → `FakeEmbeddings` → `InMemoryVectorStore` → similarity search → RAG QA |
| `08-streaming.ts` | Direct streaming, `StreamingCallbackHandler`, concurrent streams, latency measurement |
| `09-retrieval-qa.ts` | `OpenAIEmbeddings`, `VectorStoreRetriever`, `RetrievalQAChain` |
| `10-native-tools-and-structured.ts` | Native `callWithTools()` and `generateStructured()` with `ChatOpenAI` |
| `11-tool-calling-agent.ts` | `ToolCallingAgent` and `ToolCallingAgentExecutor` with native tool calling |
| `12-tracing-and-evals.ts` | `TracingCallbackHandler`, `CostTrackingHandler`, and `runEvaluation()` |
| `13-checkpoints.ts` | `ToolCallingAgentExecutor` resume flow with `InMemoryCheckpointStore` |
| `14-human-approval.ts` | Human approval pause/resume flow with checkpointed tool gating |
| `15-workflow-graph.ts` | `WorkflowGraph` branching, pause/resume, and workflow checkpoint state |
| `16-parallel-workflow.ts` | Parallel workflow branches with namespaced merge semantics |
| `17-governance-controls.ts` | RBAC, policy enforcement, and audit logging for a governed tool-calling agent |
| `18-monitoring-dashboard.ts` | Monitoring snapshots, alert evaluation, and static dashboard rendering |
| `19-plugins-and-connectors.ts` | Plugin registry usage and outbound connector dispatch |
| `20-management-server.ts` | Self-hosted management server with bearer auth |
| `21-simple-create-agent.ts` | High-level `createAgent()` facade with object-style tools |
| `22-mcp-client-server.ts` | MCP server/client flow plus MCP tools inside `createAgent()` |

## Running Examples

### Prerequisites

1. Node.js 18 or later
2. An Anthropic API key (most examples use `ChatAnthropic`)

### Setup

```bash
# From the project root
npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...
```

### Run with ts-node

```bash
npx ts-node examples/01-basic-llm.ts
npx ts-node examples/02-prompt-templates.ts
npx ts-node examples/03-llm-chain.ts
npx ts-node examples/04-router-chain.ts
npx ts-node examples/05-agent-with-tools.ts
npx ts-node examples/06-memory-chat.ts
npx ts-node examples/07-rag-pipeline.ts
npx ts-node examples/08-streaming.ts
npx ts-node examples/09-retrieval-qa.ts
npx ts-node examples/10-native-tools-and-structured.ts
npx ts-node examples/11-tool-calling-agent.ts
npx ts-node examples/12-tracing-and-evals.ts
npx ts-node examples/13-checkpoints.ts
npx ts-node examples/14-human-approval.ts
npx ts-node examples/15-workflow-graph.ts
npx ts-node examples/16-parallel-workflow.ts
npx ts-node examples/17-governance-controls.ts
npx ts-node examples/18-monitoring-dashboard.ts
npx ts-node examples/19-plugins-and-connectors.ts
npx ts-node examples/20-management-server.ts
npx ts-node examples/21-simple-create-agent.ts
npx ts-node examples/22-mcp-client-server.ts
```

### Run without ts-node (compile first)

```bash
npm run build
node dist/examples/01-basic-llm.js
```

## Using a Different Provider

All examples use `ChatAnthropic` by default. To use a different provider, swap the import:

```typescript
// OpenAI
import { ChatOpenAI } from '../src'
const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o'
})

// Ollama (no API key required)
import { ChatOllama } from '../src'
const llm = new ChatOllama({
  model: 'llama3.2',
  baseUrl: 'http://localhost:11434'
})
```

## Notes

- `05-agent-with-tools.ts` uses the Wikipedia API for `ResearchTool` and requires internet access.
- `07-rag-pipeline.ts` creates temporary files in your OS temp directory and cleans them up after.
- `08-streaming.ts` makes multiple API calls. Cost is minimal but not zero.
- `12-tracing-and-evals.ts` is self-contained and does not require any API keys.
- `13-checkpoints.ts` is self-contained and simulates an interrupted run before resuming from a checkpoint.
- `14-human-approval.ts` is self-contained and demonstrates pausing for approval before resuming after a rejection.
- `15-workflow-graph.ts` is self-contained and demonstrates conditional routing plus a paused workflow resume with patched state.
- `16-parallel-workflow.ts` is self-contained and demonstrates parallel fan-out and merged branch results.
- `17-governance-controls.ts` is self-contained and demonstrates authorization and policy denials with audit output.
- `18-monitoring-dashboard.ts` is self-contained and demonstrates local monitoring snapshots plus dashboard HTML output.
- `19-plugins-and-connectors.ts` is self-contained and demonstrates registry-driven extensibility plus connector dispatch.
- `20-management-server.ts` starts the local management server and prints a bearer token for dashboard access.
- `21-simple-create-agent.ts` shows the high-level facade intended for the easiest adoption path.
- `22-mcp-client-server.ts` demonstrates both MCP server and MCP client support.
