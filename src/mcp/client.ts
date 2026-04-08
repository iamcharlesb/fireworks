import { BaseTool } from "../tools/base";
import type { ToolResult } from "../schema/types";
import type {
  MCPImplementation,
  MCPInitializeResult,
  MCPJsonRpcNotification,
  MCPJsonRpcRequest,
  MCPPromptDefinition,
  MCPPromptResult,
  MCPResource,
  MCPResourceContent,
  MCPToolDefinition,
  MCPTransport
} from "./types";
import { MCP_PROTOCOL_VERSION } from "./types";

export interface MCPClientConfig {
  transport: MCPTransport;
  clientInfo?: MCPImplementation;
  protocolVersion?: string;
}

export class MCPRemoteTool extends BaseTool {
  name: string;
  description: string;
  private client: MCPClient;
  private schema?: Record<string, unknown>;

  constructor(client: MCPClient, definition: MCPToolDefinition) {
    super();
    this.client = client;
    this.name = definition.name;
    this.description = definition.description;
    this.schema = definition.inputSchema;
  }

  async call(input: string): Promise<ToolResult> {
    let arguments_: Record<string, unknown>;
    try {
      const parsed = JSON.parse(input) as unknown;
      arguments_ = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { input: parsed };
    } catch {
      arguments_ = { input };
    }

    const result = await this.client.callTool(this.name, arguments_);
    const text = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    return {
      output: text,
      error: result.isError ? text : undefined
    };
  }

  override toSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.schema ?? super.toSchema().parameters
    };
  }
}

export class InMemoryMCPTransport implements MCPTransport {
  constructor(
    private handler: (message: MCPJsonRpcRequest | MCPJsonRpcNotification) => Promise<unknown>
  ) {}

  async request(message: MCPJsonRpcRequest) {
    return (await this.handler(message)) as ReturnType<MCPTransport["request"]> extends Promise<infer T>
      ? T
      : never;
  }

  async notify(message: MCPJsonRpcNotification): Promise<void> {
    await this.handler(message);
  }
}

export class MCPClient {
  private transport: MCPTransport;
  private clientInfo: MCPImplementation;
  private protocolVersion: string;
  private requestId = 1;
  private initialized = false;

  constructor(config: MCPClientConfig) {
    this.transport = config.transport;
    this.clientInfo = config.clientInfo ?? {
      name: "fireworks-plus-plus-mcp-client",
      version: "0.1.0"
    };
    this.protocolVersion = config.protocolVersion ?? MCP_PROTOCOL_VERSION;
  }

  private nextId(): number {
    return this.requestId++;
  }

  private async request(method: string, params?: Record<string, unknown>) {
    const response = await this.transport.request({
      jsonrpc: "2.0",
      id: this.nextId(),
      method,
      params
    });

    if ("error" in response) {
      throw new Error(response.error.message);
    }

    return response.result;
  }

  async initialize(): Promise<MCPInitializeResult> {
    const result = (await this.request("initialize", {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: this.clientInfo
    })) as unknown as MCPInitializeResult;

    await this.transport.notify?.({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    });

    this.initialized = true;
    return result;
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.request("tools/list");
    return (result["tools"] as MCPToolDefinition[] | undefined) ?? [];
  }

  async callTool(name: string, arguments_: Record<string, unknown> = {}) {
    return (await this.request("tools/call", {
      name,
      arguments: arguments_
    })) as unknown as {
      content: Array<{ type: "text"; text: string } | { type: "resource"; resource: MCPResourceContent }>;
      isError?: boolean;
    };
  }

  async listResources(): Promise<MCPResource[]> {
    const result = await this.request("resources/list");
    return (result["resources"] as MCPResource[] | undefined) ?? [];
  }

  async readResource(uri: string): Promise<MCPResourceContent[]> {
    const result = await this.request("resources/read", { uri });
    return (result["contents"] as MCPResourceContent[] | undefined) ?? [];
  }

  async listPrompts(): Promise<MCPPromptDefinition[]> {
    const result = await this.request("prompts/list");
    return (result["prompts"] as MCPPromptDefinition[] | undefined) ?? [];
  }

  async getPrompt(name: string, arguments_: Record<string, unknown> = {}): Promise<MCPPromptResult> {
    return (await this.request("prompts/get", {
      name,
      arguments: arguments_
    })) as unknown as MCPPromptResult;
  }

  async asTools(): Promise<BaseTool[]> {
    const definitions = await this.listTools();
    return definitions.map((definition) => new MCPRemoteTool(this, definition));
  }

  async close(): Promise<void> {
    await this.transport.close?.();
  }
}
