import { uuidv4 } from "../utils/uuid";
import type { BaseTool } from "../tools/base";
import type {
  MCPImplementation,
  MCPInitializeResult,
  MCPJsonRpcError,
  MCPJsonRpcMessage,
  MCPJsonRpcNotification,
  MCPJsonRpcRequest,
  MCPJsonRpcResponse,
  MCPPromptDefinition,
  MCPPromptResult,
  MCPResource,
  MCPResourceContent,
  MCPServerCapabilities,
  MCPToolCallResult,
  MCPToolDefinition
} from "./types";
import { MCP_PROTOCOL_VERSION } from "./types";

export interface MCPServerResource extends MCPResource {
  read(): Promise<MCPResourceContent | MCPResourceContent[]> | MCPResourceContent | MCPResourceContent[];
}

export interface MCPServerPrompt extends MCPPromptDefinition {
  get(arguments_: Record<string, unknown>): Promise<MCPPromptResult> | MCPPromptResult;
}

export interface MCPServerConfig {
  serverInfo?: MCPImplementation;
  tools?: BaseTool[];
  resources?: MCPServerResource[];
  prompts?: MCPServerPrompt[];
  protocolVersion?: string;
}

function ok(id: string | number, result: Record<string, unknown>): MCPJsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function error(
  id: string | number,
  code: number,
  message: string,
  data?: unknown
): MCPJsonRpcError {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, data }
  };
}

export class MCPServer {
  private serverInfo: MCPImplementation;
  private protocolVersion: string;
  private tools: BaseTool[];
  private resources: MCPServerResource[];
  private prompts: MCPServerPrompt[];
  private initialized = false;

  constructor(config: MCPServerConfig = {}) {
    this.serverInfo = config.serverInfo ?? {
      name: "fireworks-plus-plus-mcp",
      version: "0.1.0"
    };
    this.protocolVersion = config.protocolVersion ?? MCP_PROTOCOL_VERSION;
    this.tools = config.tools ?? [];
    this.resources = config.resources ?? [];
    this.prompts = config.prompts ?? [];
  }

  getCapabilities(): MCPServerCapabilities {
    return {
      tools: this.tools.length > 0 ? { listChanged: true } : undefined,
      resources: this.resources.length > 0 ? { listChanged: true, subscribe: false } : undefined,
      prompts: this.prompts.length > 0 ? { listChanged: true } : undefined
    };
  }

  private initialize(): MCPInitializeResult {
    this.initialized = true;
    return {
      protocolVersion: this.protocolVersion,
      capabilities: this.getCapabilities(),
      serverInfo: this.serverInfo
    };
  }

  private listTools(): { tools: MCPToolDefinition[] } {
    return {
      tools: this.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.toSchema().parameters
      }))
    };
  }

  private async callTool(params: Record<string, unknown> = {}): Promise<MCPToolCallResult> {
    const name = String(params["name"] ?? "");
    const tool = this.tools.find((candidate) => candidate.name === name);
    if (!tool) {
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
    }

    const arguments_ = (params["arguments"] ?? {}) as Record<string, unknown>;
    const input =
      typeof arguments_["input"] === "string"
        ? arguments_["input"]
        : Object.keys(arguments_).length === 0
        ? ""
        : JSON.stringify(arguments_);

    try {
      const output = await tool.run(input);
      return {
        content: [{ type: "text", text: output }],
        isError: false
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        content: [{ type: "text", text: message }],
        isError: true
      };
    }
  }

  private listResources(): { resources: MCPResource[] } {
    return {
      resources: this.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType
      }))
    };
  }

  private async readResource(params: Record<string, unknown> = {}): Promise<{ contents: MCPResourceContent[] }> {
    const uri = String(params["uri"] ?? "");
    const resource = this.resources.find((candidate) => candidate.uri === uri);
    if (!resource) {
      throw Object.assign(new Error("Resource not found"), {
        code: -32002,
        data: { uri }
      });
    }

    const value = await resource.read();
    return {
      contents: Array.isArray(value) ? value : [value]
    };
  }

  private listPrompts(): { prompts: MCPPromptDefinition[] } {
    return {
      prompts: this.prompts.map((prompt) => ({
        name: prompt.name,
        title: prompt.title,
        description: prompt.description,
        arguments: prompt.arguments
      }))
    };
  }

  private async getPrompt(params: Record<string, unknown> = {}): Promise<MCPPromptResult> {
    const name = String(params["name"] ?? "");
    const prompt = this.prompts.find((candidate) => candidate.name === name);
    if (!prompt) {
      throw Object.assign(new Error(`Unknown prompt: ${name}`), { code: -32602 });
    }

    return prompt.get((params["arguments"] ?? {}) as Record<string, unknown>);
  }

  async handleMessage(
    message: MCPJsonRpcMessage
  ): Promise<MCPJsonRpcResponse | MCPJsonRpcError | undefined> {
    if (!("method" in message)) {
      return undefined;
    }

    if (!("id" in message)) {
      await this.handleNotification(message);
      return undefined;
    }

    const request = message as MCPJsonRpcRequest;

    try {
      switch (request.method) {
        case "initialize":
          return ok(request.id, this.initialize() as unknown as Record<string, unknown>);
        case "tools/list":
          return ok(request.id, this.listTools() as unknown as Record<string, unknown>);
        case "tools/call":
          return ok(request.id, (await this.callTool(request.params)) as unknown as Record<string, unknown>);
        case "resources/list":
          return ok(request.id, this.listResources() as unknown as Record<string, unknown>);
        case "resources/read":
          return ok(
            request.id,
            (await this.readResource(request.params)) as unknown as Record<string, unknown>
          );
        case "prompts/list":
          return ok(request.id, this.listPrompts() as unknown as Record<string, unknown>);
        case "prompts/get":
          return ok(request.id, (await this.getPrompt(request.params)) as unknown as Record<string, unknown>);
        default:
          return error(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (cause) {
      const err = cause as Error & { code?: number; data?: unknown };
      return error(request.id, err.code ?? -32603, err.message, err.data);
    }
  }

  async handleNotification(_message: MCPJsonRpcNotification): Promise<void> {
    if (_message.method === "notifications/initialized") {
      this.initialized = true;
    }
  }

  createToolListChangedNotification(): MCPJsonRpcNotification {
    return { jsonrpc: "2.0", method: "notifications/tools/list_changed" };
  }

  createPromptListChangedNotification(): MCPJsonRpcNotification {
    return { jsonrpc: "2.0", method: "notifications/prompts/list_changed" };
  }

  createResourceListChangedNotification(): MCPJsonRpcNotification {
    return { jsonrpc: "2.0", method: "notifications/resources/list_changed" };
  }
}
