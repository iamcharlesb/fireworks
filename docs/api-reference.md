# API Reference

Complete reference for all public classes and methods in Fireworks++.

---

## Chat Models

### ChatAnthropic

```typescript
import { ChatAnthropic } from 'fireworks-plus-plus'
new ChatAnthropic(config?: ChatAnthropicConfig)
```

**Config (`ChatAnthropicConfig`):**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | `string` | `ANTHROPIC_API_KEY` env | Anthropic API key |
| `model` | `string` | `"claude-3-5-sonnet-20241022"` | Model name |
| `temperature` | `number` | `0.7` | Sampling temperature (0–1) |
| `maxTokens` | `number` | `2048` | Max tokens to generate |
| `topP` | `number` | `1.0` | Nucleus sampling |
| `stop` | `string[]` | `[]` | Stop sequences |
| `timeout` | `number` | `60000` | Request timeout (ms) |
| `baseUrl` | `string` | `"https://api.anthropic.com"` | API base URL |
| `anthropicVersion` | `string` | `"2023-06-01"` | API version header |
| `systemPrompt` | `string` | — | Default system message |
| `verbose` | `boolean` | `false` | Console debug logging |
| `callbacks` | `CallbackHandler[]` | `[]` | Lifecycle callbacks |
| `streaming` | `boolean` | `false` | Enable streaming mode |

**Methods:**

```typescript
call(messages: Message[], options?: RunOptions): Promise<Message>
predict(messages: Message[], options?: RunOptions): Promise<string>
invoke(messages: Message[], options?: RunOptions): Promise<Message>
stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void>
callWithTools(messages: Message[], tools: FunctionDefinition[], options?: ToolCallOptions): Promise<Message>
generateStructured<T>(messages: Message[], schema: StructuredOutputSchema, options?: RunOptions): Promise<T>
generate(messages: Message[][], options?: RunOptions): Promise<LLMResult>
toJSON(): Record<string, unknown>
```

---

### ChatOpenAI

```typescript
import { ChatOpenAI } from 'fireworks-plus-plus'
new ChatOpenAI(config?: ChatOpenAIConfig)
```

**Config:** Same shape as `ChatAnthropicConfig` with `apiKey` defaulting to `OPENAI_API_KEY` env, `model` defaulting to `"gpt-4o"`, and additional `organization?: string`.

---

### ChatGemini

```typescript
import { ChatGemini } from 'fireworks-plus-plus'
new ChatGemini(config?: ChatGeminiConfig)
```

**Config:** Same shape with `apiKey` defaulting to `GEMINI_API_KEY` env, `model` defaulting to `"gemini-2.0-flash"`, and `baseUrl?: string`.

---

### ChatPerplexity

```typescript
import { ChatPerplexity } from 'fireworks-plus-plus'
new ChatPerplexity(config?: ChatPerplexityConfig)
```

**Config:** Same shape with `apiKey` defaulting to `PERPLEXITY_API_KEY` env, `model` defaulting to `"llama-3.1-sonar-large-128k-online"`.

---

### ChatOllama

```typescript
import { ChatOllama } from 'fireworks-plus-plus'
new ChatOllama(config?: ChatOllamaConfig)
```

**Config:** `model` (default `"llama3.2"`), `baseUrl` (default `"http://localhost:11434"`), plus standard temperature/maxTokens/etc.

---

## LLMs (Text Completion)

### Anthropic

```typescript
import { Anthropic } from 'fireworks-plus-plus'
new Anthropic(config?: AnthropicLLMConfig)
```

**Methods:**

```typescript
call(prompt: string, options?: RunOptions): Promise<string>
predict(text: string, options?: RunOptions): Promise<string>
stream(prompt: string, callback: StreamCallback, options?: RunOptions): Promise<void>
generate(prompts: string[], options?: RunOptions): Promise<LLMResult>
```

Also available: `OpenAI`, `PerplexityLLM`, `OllamaLLM` with equivalent shapes.

Also available: `GeminiLLM` with equivalent shape and `model` defaulting to `"gemini-2.0-flash"`.

---

## Prompts

### PromptTemplate

```typescript
import { PromptTemplate } from 'fireworks-plus-plus'
new PromptTemplate(template: string, inputVariables?: string[], options?: { templateFormat?: 'f-string' | 'mustache' })
```

**Static factory:**

```typescript
PromptTemplate.fromTemplate(template: string): PromptTemplate
```

**Methods:**

```typescript
format(values: Record<string, string>): string
partial(partialValues: Record<string, string>): PromptTemplate
getInputVariables(): string[]
toJSON(): Record<string, unknown>
```

---

### ChatPromptTemplate

```typescript
import { ChatPromptTemplate } from 'fireworks-plus-plus'
new ChatPromptTemplate(messageTemplates: MessageTemplate[])
```

**Static factory:**

```typescript
ChatPromptTemplate.fromMessages(templates: Array<[MessageRole | string, string]>): ChatPromptTemplate
```

**Methods:**

```typescript
formatMessages(values: Record<string, string>): Message[]
format(values: Record<string, string>): string       // Returns formatted string (uses first message)
partial(partialValues: Record<string, string>): ChatPromptTemplate
getInputVariables(): string[]
toJSON(): Record<string, unknown>
```

---

### FewShotPromptTemplate

```typescript
import { FewShotPromptTemplate } from 'fireworks-plus-plus'
new FewShotPromptTemplate(config: FewShotPromptTemplateConfig)
```

**Config:**

```typescript
interface FewShotPromptTemplateConfig {
  examples: FewShotExample[]
  exampleTemplate: string
  prefix?: string
  suffix: string
  inputVariables: string[]
  exampleSeparator?: string  // Default: "\n\n"
}
```

**Methods:** `format()`, `getInputVariables()`

---

### System/Human/AI Message Templates

```typescript
import { SystemMessagePromptTemplate, HumanMessagePromptTemplate, AIMessagePromptTemplate } from 'fireworks-plus-plus'

// Each wraps a PromptTemplate and produces a Message with the correct role
new SystemMessagePromptTemplate(template: string)
new HumanMessagePromptTemplate(template: string)
new AIMessagePromptTemplate(template: string)

// Methods:
format(values: Record<string, string>): Message
```

---

## Chains

### LLMChain

```typescript
import { LLMChain } from 'fireworks-plus-plus'
new LLMChain(
  llm: BaseLLM | BaseChatModel,
  prompt: BasePromptTemplate,
  config?: LLMChainConfig
)
```

**Config:**

```typescript
interface LLMChainConfig {
  outputKey?: string                      // Default: "text"
  outputParser?: BaseOutputParser<unknown>
  callbacks?: CallbackHandler[]
  verbose?: boolean
}
```

**Methods:**

```typescript
run(input: string | Record<string, string>): Promise<string>
predict(inputs: Record<string, string>): Promise<string>
call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues>
```

---

### SequentialChain

```typescript
import { SequentialChain } from 'fireworks-plus-plus'
new SequentialChain(
  chains: BaseChain[],
  inputVariables: string[],
  outputVariables: string[],
  config?: SequentialChainConfig
)
```

**Config:** `returnAll?: boolean` — if `true`, includes all intermediate values in output.

---

### SimpleSequentialChain

```typescript
import { SimpleSequentialChain } from 'fireworks-plus-plus'
new SimpleSequentialChain(chains: BaseChain[], config?: BaseChainConfig)
```

Input key: `"input"`. Output key: `"output"`.

---

### RetrievalQAChain

```typescript
import { RetrievalQAChain } from 'fireworks-plus-plus'
new RetrievalQAChain(
  llm: BaseLLM | BaseChatModel,
  retriever: BaseRetriever,
  config?: RetrievalQAChainConfig
)
```

**Config:** `inputKey?: string`, `outputKey?: string`, `returnSourceDocuments?: boolean`, `prompt?: BasePromptTemplate`.

---

## Agents

### createAgent

```typescript
import { createAgent } from 'fireworks-plus-plus'

createAgent(config?: CreateAgentConfig): SimpleAgent
```

### SimpleAgent

```typescript
import { createAgent } from 'fireworks-plus-plus'

const agent = createAgent()

ask(input: string, options?: { threadId?: string; callbacks?: CallbackHandler[] }): Promise<SimpleAskResult>
use(name: string, definition: SimpleToolDefinition): SimpleAgent
use(tool: BaseTool): SimpleAgent
enableGovernance(config: SimpleGovernanceConfig): SimpleAgent
alerts(): Promise<MonitoringAlert[]>
dashboard(options?: { html?: boolean; writeTo?: string }): Promise<MonitoringSnapshot | string>
createServer(config?: Omit<ManagementServerConfig, "auditPath" | "checkpointDir" | "workflowDir">): ManagementServer
toExecutor(threadId?: string): ToolCallingAgentExecutor
```

---

## MCP

### MCPServer

```typescript
import { MCPServer } from 'fireworks-plus-plus'
new MCPServer(config?: MCPServerConfig)

handleMessage(message: MCPJsonRpcMessage): Promise<MCPJsonRpcResponse | MCPJsonRpcError | undefined>
getCapabilities(): MCPServerCapabilities
```

### MCPClient

```typescript
import { MCPClient } from 'fireworks-plus-plus'
new MCPClient(config: MCPClientConfig)

initialize(): Promise<MCPInitializeResult>
listTools(): Promise<MCPToolDefinition[]>
callTool(name: string, arguments_?: Record<string, unknown>): Promise<MCPToolCallResult>
listResources(): Promise<MCPResource[]>
readResource(uri: string): Promise<MCPResourceContent[]>
listPrompts(): Promise<MCPPromptDefinition[]>
getPrompt(name: string, arguments_?: Record<string, unknown>): Promise<MCPPromptResult>
asTools(): Promise<BaseTool[]>
close(): Promise<void>
```

### InMemoryMCPTransport

```typescript
import { InMemoryMCPTransport } from 'fireworks-plus-plus'
new InMemoryMCPTransport(handler: (message) => Promise<unknown>)
```

---

### ToolCallingAgent

```typescript
import { ToolCallingAgent } from 'fireworks-plus-plus'
new ToolCallingAgent(
  llm: BaseChatModel,
  tools: BaseTool[],
  config?: ToolCallingAgentConfig
)
```

**Config:** `memory?: BaseMemory`, `systemPrompt?: string`, `toolChoice?: ToolChoice`.

### ToolCallingAgentExecutor

```typescript
import { ToolCallingAgentExecutor } from 'fireworks-plus-plus'
new ToolCallingAgentExecutor(agent: ToolCallingAgent, options?: ToolCallingExecutorConfig)
```

**Config:** `ExecutorOptions` plus `checkpointStore?: CheckpointStore`, `threadId?: string`, `checkpointMetadata?: Record<string, unknown>`.
Also supports `requireApproval?: boolean | string[] | ((action, checkpoint) => boolean | Promise<boolean>)`.

**Methods:**

```typescript
call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues>
run(input: string, callbacks?: CallbackHandler[]): Promise<string>
resume(threadId: string, callbacks?: CallbackHandler[]): Promise<ChainValues>
resumeFromCheckpoint(checkpointId: string, callbacks?: CallbackHandler[]): Promise<ChainValues>
approve(threadId: string, decision?: ApprovalDecision): Promise<ChainValues>
approveCheckpoint(checkpointId: string, decision?: ApprovalDecision): Promise<ChainValues>
reject(threadId: string, decision?: ApprovalDecision): Promise<ChainValues>
rejectCheckpoint(checkpointId: string, decision?: ApprovalDecision): Promise<ChainValues>
```

### ReActAgent

```typescript
import { ReActAgent } from 'fireworks-plus-plus'
new ReActAgent(
  llm: BaseChatModel,
  tools: BaseTool[],
  memory?: BaseMemory,
  systemPrompt?: string
)
```

### AgentExecutor

```typescript
import { AgentExecutor } from 'fireworks-plus-plus'
new AgentExecutor(agent: BaseAgent, tools: BaseTool[], options?: ExecutorOptions)
```

---

### RouterChain

```typescript
import { RouterChain } from 'fireworks-plus-plus'
new RouterChain(
  intentRouter: IntentRouter,
  destinations: Record<string, BaseChain>,
  defaultChain: BaseChain,
  config?: RouterChainConfig
)
```

**Output keys:** `output`, `destination`

---

### MultiRouteChain

```typescript
import { MultiRouteChain } from 'fireworks-plus-plus'
new MultiRouteChain(
  intentRouter: IntentRouter,
  destinations: Record<string, BaseChain>,
  defaultChain: BaseChain,
  config?: BaseChainConfig
)
```

**Output keys:** `output`, `destination`, `confidence`, `reasoning`

---

### TransformChain

```typescript
import { TransformChain } from 'fireworks-plus-plus'
new TransformChain(config: TransformChainConfig)
```

**Config:**

```typescript
interface TransformChainConfig {
  inputVariables: string[]
  outputVariables: string[]
  transform: (inputs: ChainValues) => ChainValues | Promise<ChainValues>
  callbacks?: CallbackHandler[]
  verbose?: boolean
}
```

---

## Agents

### ReActAgent

```typescript
import { ReActAgent } from 'fireworks-plus-plus'
new ReActAgent(
  llm: BaseChatModel,
  tools: BaseTool[],
  memory?: BaseMemory,
  systemPrompt?: string
)
```

**Properties:**
- `agentType: "react"`
- `allowedTools: string[]`

**Methods:**
```typescript
plan(
  intermediateSteps: Array<[AgentAction, string]>,
  inputs: ChainValues
): Promise<AgentAction | AgentFinish>
```

### AgentExecutor

```typescript
import { AgentExecutor } from 'fireworks-plus-plus'
new AgentExecutor(agent: BaseAgent, tools: BaseTool[], options?: ExecutorOptions)
```

**Methods:**
```typescript
call(inputs: ChainValues, callbacks?: CallbackHandler[]): Promise<ChainValues>
run(input: string, callbacks?: CallbackHandler[]): Promise<string>
```

**ExecutorOptions:**

| Option | Type | Default |
|--------|------|---------|
| `maxIterations` | `number` | `15` |
| `returnIntermediateSteps` | `boolean` | `false` |
| `earlyStoppingMethod` | `"force" \| "generate"` | `"force"` |
| `handleParsingErrors` | `boolean` | `true` |
| `verbose` | `boolean` | `false` |

---

## Tools

### BaseTool

```typescript
abstract class BaseTool {
  abstract name: string
  abstract description: string
  abstract call(input: string): Promise<ToolResult>
  run(input: string, callbacks?: CallbackHandler[]): Promise<string>
  toSchema(): Record<string, unknown>
}
```

### DynamicTool

```typescript
import { DynamicTool } from 'fireworks-plus-plus'
new DynamicTool(config: {
  name: string
  description: string
  func: (input: string) => Promise<ToolResult>
  callbacks?: CallbackHandler[]
  verbose?: boolean
  returnDirect?: boolean
})
```

### CalculatorTool

```typescript
import { CalculatorTool } from 'fireworks-plus-plus'
new CalculatorTool(config?: BaseToolConfig)
// name: "calculator"
```

### ResearchTool

```typescript
import { ResearchTool } from 'fireworks-plus-plus'
new ResearchTool(config?: ResearchToolConfig)
// name: "research"
```

**Config:** `maxResults?: number` (default 3), `language?: string` (default `"en"`).

### BrowserTool

```typescript
import { BrowserTool } from 'fireworks-plus-plus'
new BrowserTool(config?: BrowserToolConfig)
// name: "browser"
```

### SSHTool

```typescript
import { SSHTool } from 'fireworks-plus-plus'
new SSHTool(config: SSHToolConfig)
// name: "ssh"
```

**Config:** `connection: SSHConnectionConfig` (required), `timeout?: number`.

### DocumentTool

```typescript
import { DocumentTool } from 'fireworks-plus-plus'
new DocumentTool(config?: DocumentToolConfig)
// name: "document"
```

**Config:** `outputDir?: string`, `defaultFormat?: DocumentFormat` (`"txt" | "md" | "html" | "json" | "csv"`).

### EditorTool

```typescript
import { EditorTool } from 'fireworks-plus-plus'
new EditorTool(config?: EditorToolConfig)
// name: "editor"
```

**Config:** `workspacePath?: string`, `openInEditor?: boolean`, `editor?: string`.

---

## Memory

### ConversationBufferMemory

```typescript
import { ConversationBufferMemory } from 'fireworks-plus-plus'
new ConversationBufferMemory(config?: BufferMemoryConfig)
```

**Methods:**

```typescript
loadMemoryVariables(inputs?: ChainValues): Promise<Record<string, unknown>>
saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void>
clear(): Promise<void>
getChatMessages(): Message[]
getBufferString(): string
addUserMessage(content: string): void
addAIMessage(content: string): void
toString(): string
```

---

### ConversationWindowMemory

```typescript
import { ConversationWindowMemory } from 'fireworks-plus-plus'
new ConversationWindowMemory(config?: WindowMemoryConfig)
// Config: k?: number (default 5)
```

Same methods as `ConversationBufferMemory`.

---

### ConversationSummaryMemory

```typescript
import { ConversationSummaryMemory } from 'fireworks-plus-plus'
new ConversationSummaryMemory(config: SummaryMemoryConfig)
// config.llm is required
```

**Additional methods:**

```typescript
getSummary(): string
```

---

### ThreadedMemory

```typescript
import { ThreadedMemory } from 'fireworks-plus-plus'
new ThreadedMemory(config?: ThreadMemoryConfig)
```

**Methods:**

```typescript
createThread(id?: string): string
setActiveThread(threadId: string): void
getActiveThreadId(): string
getThread(threadId: string): Promise<Message[]>
addToThread(threadId: string, message: Message): Promise<void>
getActiveThreadMessages(): Promise<Message[]>
loadMemoryVariables(inputs?: ChainValues): Promise<Record<string, unknown>>
saveContext(inputs: ChainValues, outputs: ChainValues): Promise<void>
clearThread(threadId: string): Promise<void>
clear(): Promise<void>
listThreads(): ThreadSummary[]
deleteThread(threadId: string): void
toString(): string
```

---

## Output Parsers

### JsonOutputParser

```typescript
import { JsonOutputParser } from 'fireworks-plus-plus'
new JsonOutputParser()
parse(output: string): Record<string, unknown>
getFormatInstructions(): string
```

### StructuredOutputParser

```typescript
import { StructuredOutputParser } from 'fireworks-plus-plus'
new StructuredOutputParser(schema: OutputSchema)
StructuredOutputParser.fromNamesAndDescriptions(fields: Record<string, string>): StructuredOutputParser
parse(output: string): Record<string, unknown>
getFormatInstructions(): string
```

### CommaSeparatedListOutputParser

```typescript
import { CommaSeparatedListOutputParser } from 'fireworks-plus-plus'
new CommaSeparatedListOutputParser()
parse(output: string): string[]
```

### NumberedListOutputParser

```typescript
import { NumberedListOutputParser } from 'fireworks-plus-plus'
new NumberedListOutputParser()
parse(output: string): string[]
```

### LineOutputParser

```typescript
import { LineOutputParser } from 'fireworks-plus-plus'
new LineOutputParser()
parse(output: string): string[]
```

---

## Document Loaders

### TextLoader

```typescript
import { TextLoader } from 'fireworks-plus-plus'
new TextLoader(filePath: string, encoding?: BufferEncoding)
load(): Promise<Document[]>
loadAndSplit(splitter?: BaseTextSplitter): Promise<Document[]>
lazyLoad(): AsyncGenerator<Document>
```

### JSONLoader

```typescript
import { JSONLoader } from 'fireworks-plus-plus'
new JSONLoader(filePath: string, pointers?: string[])
load(): Promise<Document[]>
```

### CSVLoader

```typescript
import { CSVLoader } from 'fireworks-plus-plus'
new CSVLoader(filePath: string, options?: CSVLoaderOptions)
load(): Promise<Document[]>
```

---

## Text Splitters

### CharacterTextSplitter

```typescript
import { CharacterTextSplitter } from 'fireworks-plus-plus'
new CharacterTextSplitter(options?: TextSplitterOptions)
splitText(text: string): Promise<string[]>
splitDocuments(documents: Document[]): Promise<Document[]>
```

### RecursiveCharacterTextSplitter

```typescript
import { RecursiveCharacterTextSplitter } from 'fireworks-plus-plus'
new RecursiveCharacterTextSplitter(options?: TextSplitterOptions)
splitText(text: string): Promise<string[]>
splitDocuments(documents: Document[]): Promise<Document[]>
```

**TextSplitterOptions:**

```typescript
interface TextSplitterOptions {
  chunkSize?: number      // Default: 1000
  chunkOverlap?: number   // Default: 200
  separators?: string[]   // RecursiveCharacterTextSplitter only
}
```

---

## Embeddings

### FakeEmbeddings

```typescript
import { FakeEmbeddings } from 'fireworks-plus-plus'
new FakeEmbeddings(dimensions?: number)  // Default: 128
embedQuery(text: string): Promise<number[]>
embedDocuments(texts: string[]): Promise<number[][]>
```

### OpenAIEmbeddings

```typescript
import { OpenAIEmbeddings } from 'fireworks-plus-plus'
new OpenAIEmbeddings(config?: OpenAIEmbeddingsConfig)
embedQuery(text: string): Promise<number[]>
embedDocuments(texts: string[]): Promise<number[][]>
```

**Config:** `apiKey?: string`, `model?: string`, `baseUrl?: string`, `organization?: string`, `timeout?: number`, `batchSize?: number`, `dimensions?: number`.

### BaseEmbeddings (abstract)

```typescript
import { BaseEmbeddings } from 'fireworks-plus-plus'
abstract embedQuery(text: string): Promise<number[]>
abstract embedDocuments(texts: string[]): Promise<number[][]>
static cosineSimilarity(a: number[], b: number[]): number
static normalize(vector: number[]): number[]
```

---

## Vector Stores

### InMemoryVectorStore

```typescript
import { InMemoryVectorStore } from 'fireworks-plus-plus'
new InMemoryVectorStore(embeddings: BaseEmbeddings)
```

**Static factories:**

```typescript
InMemoryVectorStore.fromDocuments(docs: Document[], embeddings: BaseEmbeddings): Promise<InMemoryVectorStore>
InMemoryVectorStore.fromTexts(texts: string[], metadatas: Record<string, unknown>[], embeddings: BaseEmbeddings): Promise<InMemoryVectorStore>
```

**Methods:**

```typescript
addDocuments(documents: Document[]): Promise<void>
addVectors(vectors: number[][], documents: Document[]): Promise<void>
similaritySearch(query: string, k: number, filter?: Record<string, unknown>): Promise<Document[]>
similaritySearchWithScore(query: string, k: number, filter?: Record<string, unknown>): Promise<SimilarityResult[]>
delete(filter: Record<string, unknown>): Promise<void>
get size(): number
```

---

## Retrievers

### BaseRetriever (abstract)

```typescript
import { BaseRetriever } from 'fireworks-plus-plus'
abstract getRelevantDocuments(query: string): Promise<Document[]>
invoke(query: string): Promise<Document[]>
```

### VectorStoreRetriever

```typescript
import { VectorStoreRetriever } from 'fireworks-plus-plus'
new VectorStoreRetriever(vectorStore: VectorStore, config?: VectorStoreRetrieverConfig)
getRelevantDocuments(query: string): Promise<Document[]>
invoke(query: string): Promise<Document[]>
```

**Config:** `k?: number`, `filter?: Record<string, unknown>`, `searchType?: 'similarity' | 'mmr'`, `fetchK?: number`, `lambdaMult?: number`.

---

## Callbacks

### LoggingCallbackHandler

```typescript
import { LoggingCallbackHandler } from 'fireworks-plus-plus'
new LoggingCallbackHandler(options?: LoggingCallbackHandlerOptions)
```

**Options:** `level?: 'debug' | 'info' | 'warn'` (default `"info"`), `prefix?: string` (default `"[Fireworks++]"`).

### StreamingCallbackHandler

```typescript
import { StreamingCallbackHandler } from 'fireworks-plus-plus'
new StreamingCallbackHandler(onToken: (token: string) => void)
getBuffer(): string
reset(): void
```

### TracingCallbackHandler

```typescript
import { TracingCallbackHandler } from 'fireworks-plus-plus'
new TracingCallbackHandler()
getRun(runId: string): TraceRun | undefined
getRuns(): TraceRun[]
getRootRuns(): TraceRun[]
getSummary(): TraceSummary
clear(): void
printSummary(): void
```

### CostTrackingHandler

```typescript
import { CostTrackingHandler } from 'fireworks-plus-plus'
new CostTrackingHandler(options?: CostTrackingHandlerOptions)
getSummary(): CostSummary
reset(): void
printSummary(): void
```

**Options:** `pricing?: Record<string, { input: number; output: number }>`

---

## Evaluations

### runEvaluation

```typescript
import { runEvaluation } from 'fireworks-plus-plus'

runEvaluation<TInput, TExpected, TActual>({
  cases,
  target,
  evaluator
}): Promise<EvaluationSummary<TInput, TExpected, TActual>>
```

### ExactMatchEvaluator

```typescript
import { ExactMatchEvaluator } from 'fireworks-plus-plus'
new ExactMatchEvaluator()
evaluate(actual: unknown, expected: unknown): Promise<EvaluationOutcome>
```

### ContainsStringEvaluator

```typescript
import { ContainsStringEvaluator } from 'fireworks-plus-plus'
new ContainsStringEvaluator()
evaluate(actual: string, expected: string): Promise<EvaluationOutcome>
```

---

## Checkpoints

### InMemoryCheckpointStore

```typescript
import { InMemoryCheckpointStore } from 'fireworks-plus-plus'
new InMemoryCheckpointStore()
save(checkpoint: AgentCheckpoint): Promise<void>
get(checkpointId: string): Promise<AgentCheckpoint | undefined>
getLatest(threadId: string): Promise<AgentCheckpoint | undefined>
list(options?: ListCheckpointsOptions): Promise<AgentCheckpoint[]>
delete(checkpointId: string): Promise<void>
clear(): Promise<void>
```

### FileCheckpointStore

```typescript
import { FileCheckpointStore } from 'fireworks-plus-plus'
new FileCheckpointStore({ directory?: string })
```

### ApprovalDecision

```typescript
interface ApprovalDecision {
  reviewer?: string
  reason?: string
}
```

---

## Governance

### RBACAuthorizer

```typescript
import { RBACAuthorizer } from 'fireworks-plus-plus'
new RBACAuthorizer(config?: RBACAuthorizerConfig)

authorize(request: AuthorizationRequest): Promise<GovernanceDecision>
registerRole(role: GovernanceRole): void
```

**Config:** `roles?: GovernanceRole[]`, `defaultAllow?: boolean`.

### PolicyEngine

```typescript
import { PolicyEngine } from 'fireworks-plus-plus'
new PolicyEngine(config?: PolicyEngineConfig)

evaluate(context: GovernanceRuleContext): Promise<GovernanceDecision>
registerRule(rule: GovernanceRule): void
```

**Config:** `rules?: GovernanceRule[]`, `defaultAllow?: boolean`.

### BudgetManager

```typescript
import { BudgetManager } from 'fireworks-plus-plus'
new BudgetManager(config?: BudgetManagerConfig)

consume(name: string, amount?: number): BudgetDecision
getUsage(name: string): BudgetUsage | undefined
getAllUsage(): BudgetUsage[]
reset(name?: string): void
setLimit(name: string, max: number): void
```

**Config:** `limits?: BudgetLimit[]`.

### InMemoryAuditLogger

```typescript
import { InMemoryAuditLogger } from 'fireworks-plus-plus'
new InMemoryAuditLogger()

record(event: AuditEvent): Promise<void>
list(filter?: AuditEventFilter): Promise<AuditEvent[]>
clear(): Promise<void>
```

### FileAuditLogger

```typescript
import { FileAuditLogger } from 'fireworks-plus-plus'
new FileAuditLogger({ filePath?: string })
```

### GovernanceBudgetHandler

```typescript
import { GovernanceBudgetHandler } from 'fireworks-plus-plus'
new GovernanceBudgetHandler({
  budgetManager: BudgetManager,
  auditLogger?: AuditLogger
})
```

Consumes `input_tokens`, `output_tokens`, and `total_tokens` budgets on `onLLMEnd()`.

---

## Auth

### HS256Authenticator

```typescript
import { HS256Authenticator } from 'fireworks-plus-plus'
new HS256Authenticator(config: HS256AuthenticatorConfig)

authenticate(headers: Record<string, string | string[] | undefined>): Promise<AuthSession | undefined>
```

**Static helper:** `HS256Authenticator.sign(claims: AuthClaims, secret: string): string`

### SAMLAttributeMapper

```typescript
import { SAMLAttributeMapper } from 'fireworks-plus-plus'
new SAMLAttributeMapper(config?: SAMLAttributeMapperConfig)

map(attributes: Record<string, unknown>): AuthSession
```

---

## Plugins

### PluginRegistry

```typescript
import { PluginRegistry } from 'fireworks-plus-plus'
new PluginRegistry()

registerManifest(manifest: PluginManifest): void
registerTool(plugin: ToolPluginDefinition): void
registerLoader(plugin: LoaderPluginDefinition): void
registerWorkflowNode(plugin: WorkflowNodePluginDefinition): void
registerCallback(plugin: CallbackPluginDefinition): void
createTool(name: string, context?: ToolPluginFactoryContext): BaseTool
createLoader(name: string, context?: LoaderPluginFactoryContext): BaseDocumentLoader
createWorkflowNode(name: string, context?: WorkflowPluginFactoryContext): WorkflowNodeHandler
createCallback(name: string, context?: CallbackPluginFactoryContext): CallbackHandler
list(): { tools: string[]; loaders: string[]; workflowNodes: string[]; callbacks: string[] }
```

---

## Integrations

### ConnectorDispatcher

```typescript
import { ConnectorDispatcher } from 'fireworks-plus-plus'
new ConnectorDispatcher({ connectors?: IntegrationConnector[] })

add(connector: IntegrationConnector): void
dispatch(payload: ConnectorPayload): Promise<void>
dispatchAlert(alert: MonitoringAlert): Promise<void>
dispatchAudit(event: AuditEvent): Promise<void>
```

### Connectors

```typescript
new WebhookConnector({ url: string, headers?: Record<string, string> })
new RestConnector({ url: string, headers?: Record<string, string> })
new DatadogConnector({ apiKey: string, site?: string, titlePrefix?: string })
new SplunkHECConnector({ url: string, token: string, source?: string, sourcetype?: string })
new KafkaRestConnector({ url: string, topic: string, headers?: Record<string, string> })
```

---

## Monitoring

### loadMonitoringSnapshot

```typescript
import { loadMonitoringSnapshot } from 'fireworks-plus-plus'

loadMonitoringSnapshot(paths: LocalArtifactPaths, options?: { recentLimit?: number }): Promise<MonitoringSnapshot>
```

### renderMonitoringDashboardHtml

```typescript
import { renderMonitoringDashboardHtml } from 'fireworks-plus-plus'

renderMonitoringDashboardHtml(snapshot: MonitoringSnapshot, alerts?: MonitoringAlert[]): string
```

### AlertManager

```typescript
import { AlertManager } from 'fireworks-plus-plus'
new AlertManager(config?: AlertManagerConfig)

evaluate(snapshot: MonitoringSnapshot): Promise<MonitoringAlert[]>
```

**Config:** `rules?: MonitoringAlertRule[]`, `staleAfterMs?: number`, `now?: () => Date`.

---

## Server

### ManagementServer

```typescript
import { ManagementServer } from 'fireworks-plus-plus'
new ManagementServer(config: ManagementServerConfig)

start(): Promise<{ url: string; port: number }>
stop(): Promise<void>
authenticateHeaders(headers: Record<string, string | string[] | undefined>): Promise<boolean>
getDashboardPayload(): Promise<{ snapshot: MonitoringSnapshot; alerts: MonitoringAlert[] }>
renderDashboard(): Promise<string>
```

**Config:** `auditPath?: string`, `checkpointDir?: string`, `workflowDir?: string`, `host?: string`, `port?: number`, `authenticator?: Authenticator`, `corsOrigin?: string`.

---

## Workflows

### WorkflowGraph

```typescript
import { WorkflowGraph } from 'fireworks-plus-plus'
new WorkflowGraph(workflowId: string)

addNode(nodeId: string, handler: WorkflowNodeHandler, options?: { start?: boolean; terminal?: boolean }): WorkflowGraph
addEdge(from: string, to: string, condition?: WorkflowCondition, label?: string): WorkflowGraph
addConditionalEdges(from: string, branches: WorkflowBranch[]): WorkflowGraph
setStart(nodeId: string): WorkflowGraph
markTerminal(nodeId: string): WorkflowGraph
validate(): void
```

### WorkflowNodeResult

```typescript
interface WorkflowNodeResult {
  state?: ChainValues
  next?: string
  pause?: boolean
  pauseReason?: string
  output?: ChainValues
  parallel?: WorkflowParallelBranch[]
  mergeStrategy?: 'namespaced' | 'shallow'
  namespaceKey?: string
  metadata?: Record<string, unknown>
}
```

### WorkflowParallelBranch

```typescript
interface WorkflowParallelBranch {
  nodeId: string
  state?: ChainValues
  label?: string
}
```

### WorkflowExecutor

```typescript
import { WorkflowExecutor } from 'fireworks-plus-plus'
new WorkflowExecutor(graph: WorkflowGraph, config?: WorkflowExecutorConfig)

run(initialState?: ChainValues): Promise<ChainValues>
resume(threadId: string, statePatch?: ChainValues): Promise<ChainValues>
resumeFromCheckpoint(checkpointId: string, statePatch?: ChainValues): Promise<ChainValues>
```

**Config:** `checkpointStore?: WorkflowCheckpointStore`, `threadId?: string`, `maxSteps?: number`, `metadata?: Record<string, unknown>`, `verbose?: boolean`.

### InMemoryWorkflowCheckpointStore

```typescript
import { InMemoryWorkflowCheckpointStore } from 'fireworks-plus-plus'
new InMemoryWorkflowCheckpointStore()
```

### FileWorkflowCheckpointStore

```typescript
import { FileWorkflowCheckpointStore } from 'fireworks-plus-plus'
new FileWorkflowCheckpointStore({ directory?: string })
```

---

## Routing

### HeuristicRouter

```typescript
import { HeuristicRouter } from 'fireworks-plus-plus'
new HeuristicRouter()
route(input: string): RouteDecision
```

### IntentRouter

```typescript
import { IntentRouter } from 'fireworks-plus-plus'
new IntentRouter(llm?: BaseChatModel, options?: IntentRouterOptions)
route(input: string): Promise<RouteDecision>
routeWithConfidence(input: string): Promise<RouteDecision>
```

**Options:** `confidenceThreshold?: number` (default `0.7`), `timeout?: number` (default `15000`).

---

## Safety

### SafetyPolicy

```typescript
import { SafetyPolicy } from 'fireworks-plus-plus'
new SafetyPolicy()
check(input: string): SafetyResult
isBlocked(input: string): boolean
```

---

## Core Types

```typescript
// All exported from 'fireworks-plus-plus'

type MessageRole = "system" | "human" | "ai" | "function" | "tool"

interface Message {
  role: MessageRole
  content: string
  name?: string
  functionCall?: FunctionCall
  toolCalls?: ToolCall[]
  toolCallId?: string
  refusal?: string
  metadata?: Record<string, unknown>
}

interface LLMResult {
  generations: Generation[][]
  llmOutput?: Record<string, unknown>
  runId?: string
}

interface Generation {
  text: string
  generationInfo?: Record<string, unknown>
  message?: Message
}

type ChainValues = Record<string, unknown>

interface Document {
  pageContent: string
  metadata: Record<string, unknown>
  id?: string
}

type Embedding = number[]

interface RunOptions {
  stop?: string[]
  timeout?: number
  maxTokens?: number
  temperature?: number
  topP?: number
  callbacks?: CallbackHandler[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

interface StreamingChunk {
  text: string
  isFirst: boolean
  isFinal: boolean
  metadata?: Record<string, unknown>
}

type StreamCallback = (chunk: StreamingChunk) => void | Promise<void>

interface ToolResult {
  output: string
  error?: string
  metadata?: Record<string, unknown>
}

interface AgentAction {
  tool: string
  toolInput: string
  log: string
  messageLog?: Message[]
}

interface AgentFinish {
  returnValues: Record<string, unknown>
  log: string
}

interface SafetyResult {
  allowed: boolean
  reason?: string
  flaggedPatterns?: string[]
}

interface ToolCall {
  id?: string
  name: string
  arguments: string
}

type RouteKind = "llm" | "ssh" | "browser" | "research" | "document" | "editor" | "skill" | "calculator"

interface RouteDecision {
  kind: RouteKind
  confidence: number
  reasoning?: string
}

interface SimilarityResult {
  document: Document
  score: number
}

interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

type ProviderName = "anthropic" | "openai" | "perplexity" | "ollama" | "custom"

interface CallbackHandler {
  onLLMStart?: (llmName: string, prompts: string[], runId: string) => void | Promise<void>
  onLLMEnd?: (response: LLMResult, runId: string) => void | Promise<void>
  onLLMError?: (error: Error, runId: string) => void | Promise<void>
  onLLMNewToken?: (token: string, runId: string) => void | Promise<void>
  onChainStart?: (chainName: string, inputs: ChainValues, runId: string) => void | Promise<void>
  onChainEnd?: (outputs: ChainValues, runId: string) => void | Promise<void>
  onChainError?: (error: Error, runId: string) => void | Promise<void>
  onToolStart?: (toolName: string, input: string, runId: string) => void | Promise<void>
  onToolEnd?: (output: string, runId: string) => void | Promise<void>
  onToolError?: (error: Error, runId: string) => void | Promise<void>
  onAgentAction?: (action: AgentAction, runId: string) => void | Promise<void>
  onAgentFinish?: (finish: AgentFinish, runId: string) => void | Promise<void>
}

interface EvaluationCase<TInput, TExpected> {
  id?: string
  input: TInput
  expected: TExpected
  metadata?: Record<string, unknown>
}

interface EvaluationOutcome {
  passed: boolean
  score: number
  feedback?: string
}

interface EvaluationResult<TInput, TExpected, TActual> extends EvaluationOutcome {
  caseId: string
  input: TInput
  expected: TExpected
  actual: TActual
  durationMs: number
  metadata?: Record<string, unknown>
}

interface EvaluationSummary<TInput, TExpected, TActual> {
  total: number
  passed: number
  failed: number
  averageScore: number
  durationMs: number
  results: Array<EvaluationResult<TInput, TExpected, TActual>>
}
```
