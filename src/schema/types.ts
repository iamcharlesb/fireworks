// ============================================================
// Fireworks++ — Core Types & Interfaces
// ============================================================

/** Roles that can appear in a conversation message */
export type MessageRole = "system" | "human" | "ai" | "function" | "tool";

/** A single message in a conversation */
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  functionCall?: FunctionCall;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  refusal?: string;
  metadata?: Record<string, unknown>;
}

/** A function call embedded in an AI message */
export interface FunctionCall {
  name: string;
  arguments: string;
}

/** A tool call emitted by a model */
export interface ToolCall {
  id?: string;
  type?: "function";
  name: string;
  arguments: string;
}

/** A single generation result from an LLM */
export interface Generation {
  text: string;
  generationInfo?: Record<string, unknown>;
  message?: Message;
}

/** The full result returned by an LLM call */
export interface LLMResult {
  generations: Generation[][];
  llmOutput?: Record<string, unknown>;
  runId?: string;
}

/** Generic key-value map used throughout chains */
export type ChainValues = Record<string, unknown>;

/** Represents an action an agent wants to take */
export interface AgentAction {
  tool: string;
  toolInput: string;
  log: string;
  messageLog?: Message[];
}

/** Represents the agent deciding to finish */
export interface AgentFinish {
  returnValues: Record<string, unknown>;
  log: string;
}

/** A loaded document with content and metadata */
export interface Document {
  pageContent: string;
  metadata: Record<string, unknown>;
  id?: string;
}

/** A numerical embedding vector */
export type Embedding = number[];

/** Configuration for a run (callbacks, tags, etc.) */
export interface RunConfig {
  callbacks?: CallbackHandler[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  runName?: string;
  timeout?: number;
}

/** Options for LLM calls */
export interface RunOptions {
  stop?: string[];
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  callbacks?: CallbackHandler[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** A chunk of a streaming response */
export interface StreamingChunk {
  text: string;
  isFirst: boolean;
  isFinal: boolean;
  metadata?: Record<string, unknown>;
}

/** Callback for streaming tokens */
export type StreamCallback = (chunk: StreamingChunk) => void | Promise<void>;

/** Result returned from a tool execution */
export interface ToolResult {
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/** Definition of a function/tool for LLM function calling */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A parameter in a function definition */
export interface FunctionParameterDefinition {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: { type: string };
}

/** Generic tool-choice mode exposed by the SDK */
export type ToolChoice = "auto" | "none" | "required" | { name: string };

/** Options for native tool-calling requests */
export interface ToolCallOptions extends RunOptions {
  toolChoice?: ToolChoice;
  parallelToolCalls?: boolean;
}

/** JSON-schema based structured output definition */
export interface StructuredOutputSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
  strict?: boolean;
}

/** Abstract callback handler interface */
export interface CallbackHandler {
  onLLMStart?: (llmName: string, prompts: string[], runId: string) => void | Promise<void>;
  onLLMEnd?: (response: LLMResult, runId: string) => void | Promise<void>;
  onLLMError?: (error: Error, runId: string) => void | Promise<void>;
  onLLMNewToken?: (token: string, runId: string) => void | Promise<void>;
  onChainStart?: (chainName: string, inputs: ChainValues, runId: string) => void | Promise<void>;
  onChainEnd?: (outputs: ChainValues, runId: string) => void | Promise<void>;
  onChainError?: (error: Error, runId: string) => void | Promise<void>;
  onToolStart?: (toolName: string, input: string, runId: string) => void | Promise<void>;
  onToolEnd?: (output: string, runId: string) => void | Promise<void>;
  onToolError?: (error: Error, runId: string) => void | Promise<void>;
  onAgentAction?: (action: AgentAction, runId: string) => void | Promise<void>;
  onAgentFinish?: (finish: AgentFinish, runId: string) => void | Promise<void>;
}

/** Options for an agent executor */
export interface ExecutorOptions {
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  earlyStoppingMethod?: "force" | "generate";
  handleParsingErrors?: boolean;
  verbose?: boolean;
}

/** An intermediate step captured by the executor */
export interface IntermediateStep {
  action: AgentAction;
  observation: string;
}

/** Safety assessment result */
export interface SafetyResult {
  allowed: boolean;
  reason?: string;
  flaggedPatterns?: string[];
}

/** A route decision for intent routing */
export type RouteKind = "llm" | "ssh" | "browser" | "research" | "document" | "editor" | "skill" | "calculator";

/** A resolved routing decision */
export interface RouteDecision {
  kind: RouteKind;
  confidence: number;
  reasoning?: string;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Provider identifiers */
export type ProviderName = "anthropic" | "openai" | "perplexity" | "ollama" | "custom";

/** Similarity search result */
export interface SimilarityResult {
  document: Document;
  score: number;
}
