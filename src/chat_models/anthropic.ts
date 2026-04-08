import { BaseChatModel, type BaseChatModelConfig } from "./base";
import type {
  FunctionDefinition,
  Message,
  LLMResult,
  RunOptions,
  StreamCallback,
  StructuredOutputSchema,
  ToolCall,
  ToolCallOptions
} from "../schema/types";

export interface ChatAnthropicConfig extends BaseChatModelConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  anthropicVersion?: string;
  systemPrompt?: string;
}

/**
 * ChatAnthropic — chat model wrapper for Anthropic Claude.
 * Supports system messages, streaming, and multi-turn conversations.
 */
export class ChatAnthropic extends BaseChatModel {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private anthropicVersion: string;
  private systemPrompt?: string;

  constructor(config: ChatAnthropicConfig = {}) {
    super(config);
    this.modelName = config.model ?? "claude-3-5-sonnet-20241022";
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com";
    this.anthropicVersion = config.anthropicVersion ?? "2023-06-01";
    this.systemPrompt = config.systemPrompt;

    if (!this.apiKey) {
      throw new Error(
        "Anthropic API key is required. Pass apiKey in config or set ANTHROPIC_API_KEY env var."
      );
    }
  }

  _modelType(): string {
    return "chat-anthropic";
  }

  /** Convert Fireworks++ messages to Anthropic API format */
  private formatMessages(messages: Message[]): {
    system?: string;
    anthropicMessages: Array<{
      role: "user" | "assistant";
      content: Array<Record<string, unknown>>;
    }>;
  } {
    const systemChunks: string[] = [];
    if (this.systemPrompt) {
      systemChunks.push(this.systemPrompt);
    }

    const anthropicMessages: Array<{
      role: "user" | "assistant";
      content: Array<Record<string, unknown>>;
    }> = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemChunks.push(msg.content);
      } else if (msg.role === "human") {
        anthropicMessages.push({
          role: "user",
          content: [{ type: "text", text: msg.content }]
        });
      } else if (msg.role === "ai") {
        const content: Array<Record<string, unknown>> = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        for (const toolCall of msg.toolCalls ?? []) {
          let input: unknown;
          try {
            input = JSON.parse(toolCall.arguments);
          } catch {
            input = { input: toolCall.arguments };
          }
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input
          });
        }
        anthropicMessages.push({
          role: "assistant",
          content: content.length > 0 ? content : [{ type: "text", text: "" }]
        });
      } else if (msg.role === "function" || msg.role === "tool") {
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId,
              content: msg.content
            }
          ]
        });
      }
    }

    // Anthropic requires the first message to be from user
    if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
      anthropicMessages.unshift({
        role: "user",
        content: [{ type: "text", text: "(start)" }]
      });
    }

    const system = systemChunks.length > 0 ? systemChunks.join("\n\n") : undefined;
    return { system, anthropicMessages };
  }

  private formatTools(tools: FunctionDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  private mapToolChoice(toolChoice?: ToolCallOptions["toolChoice"]): Record<string, unknown> | undefined {
    if (!toolChoice) return undefined;
    if (toolChoice === "auto") return { type: "auto" };
    if (toolChoice === "none") return { type: "none" };
    if (toolChoice === "required") return { type: "any" };
    return {
      type: "tool",
      name: toolChoice.name
    };
  }

  private parseAssistantMessage(data: {
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
  }): Message {
    const contentBlocks = data.content ?? [];
    const text = contentBlocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    const toolCalls: ToolCall[] = contentBlocks
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        type: "function",
        name: block.name ?? "",
        arguments: JSON.stringify(block.input ?? {})
      }));

    return {
      role: "ai",
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  async generate(messages: Message[][], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const messageList of messages) {
      const { system, anthropicMessages } = this.formatMessages(messageList);

      const body: Record<string, unknown> = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        messages: anthropicMessages
      };

      if (system) {
        body["system"] = system;
      }

      if (options?.stop && options.stop.length > 0) {
        body["stop_sequences"] = options.stop;
      } else if (this.stop.length > 0) {
        body["stop_sequences"] = this.stop;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": this.anthropicVersion
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens: number; output_tokens: number };
        stop_reason?: string;
        model: string;
      };

      const assistantMessage = this.parseAssistantMessage(data);
      const text = assistantMessage.content;

      generations.push([
        {
          text,
          message: assistantMessage,
          generationInfo: {
            stopReason: data.stop_reason,
            usage: data.usage,
            model: data.model
          }
        }
      ]);
    }

    return { generations };
  }

  async stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void> {
    const { system, anthropicMessages } = this.formatMessages(messages);

    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      stream: true,
      messages: anthropicMessages
    };

    if (system) {
      body["system"] = system;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.anthropicVersion
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic streaming error ${response.status}: ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body reader available");

    const decoder = new TextDecoder();
    let isFirst = true;
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();

          try {
            const parsed = JSON.parse(data) as {
              type: string;
              delta?: { type: string; text?: string };
            };

            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              const text = parsed.delta.text ?? "";
              await callback({
                text,
                isFirst,
                isFinal: false,
                metadata: { model: this.modelName }
              });
              isFirst = false;
            }
          } catch {
            // Ignore malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    await callback({
      text: "",
      isFirst: false,
      isFinal: true,
      metadata: { model: this.modelName }
    });
  }

  async callWithTools(
    messages: Message[],
    tools: FunctionDefinition[],
    options?: ToolCallOptions
  ): Promise<Message> {
    const { system, anthropicMessages } = this.formatMessages(messages);

    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      top_p: options?.topP ?? this.topP,
      messages: anthropicMessages,
      tools: this.formatTools(tools)
    };

    if (system) {
      body["system"] = system;
    }

    const toolChoice = this.mapToolChoice(options?.toolChoice);
    if (toolChoice) {
      body["tool_choice"] = toolChoice;
    }

    if (options?.stop && options.stop.length > 0) {
      body["stop_sequences"] = options.stop;
    } else if (this.stop.length > 0) {
      body["stop_sequences"] = this.stop;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": this.anthropicVersion
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic tool-calling error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
    };

    return this.parseAssistantMessage(data);
  }

  async generateStructured<T>(
    messages: Message[],
    schema: StructuredOutputSchema,
    options?: RunOptions
  ): Promise<T> {
    const response = await this.callWithTools(
      messages,
      [
        {
          name: schema.name,
          description: schema.description ?? "Return the structured response.",
          parameters: schema.schema
        }
      ],
      {
        ...options,
        toolChoice: { name: schema.name }
      }
    );

    const toolCall = response.toolCalls?.find((call) => call.name === schema.name);
    if (!toolCall) {
      throw new Error("Anthropic structured-output response did not include the expected tool call.");
    }

    return this.parseJsonText<T>(toolCall.arguments);
  }
}
