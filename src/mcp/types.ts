export const MCP_PROTOCOL_VERSION = "2025-11-25";

export type MCPRequestId = string | number;

export interface MCPImplementation {
  name: string;
  version: string;
}

export interface MCPJsonRpcRequest {
  jsonrpc: "2.0";
  id: MCPRequestId;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: "2.0";
  id: MCPRequestId;
  result: Record<string, unknown>;
}

export interface MCPJsonRpcError {
  jsonrpc: "2.0";
  id: MCPRequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type MCPJsonRpcMessage =
  | MCPJsonRpcRequest
  | MCPJsonRpcNotification
  | MCPJsonRpcResponse
  | MCPJsonRpcError;

export interface MCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: MCPResourceContent }
  >;
  isError?: boolean;
}

export interface MCPResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptDefinition {
  name: string;
  title?: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptMessage {
  role: "user" | "assistant";
  content:
    | { type: "text"; text: string }
    | { type: "resource"; resource: MCPResourceContent };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

export interface MCPServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPImplementation;
}

export interface MCPTransport {
  request(message: MCPJsonRpcRequest): Promise<MCPJsonRpcResponse | MCPJsonRpcError>;
  notify?(message: MCPJsonRpcNotification): Promise<void>;
  close?(): Promise<void>;
}
