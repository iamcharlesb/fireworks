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

export interface ChatOpenAIConfig extends BaseChatModelConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/** Map Fireworks++ roles to OpenAI roles */
function toOpenAIRole(role: string): "system" | "user" | "assistant" | "function" | "tool" {
  switch (role) {
    case "system": return "system";
    case "human": return "user";
    case "ai": return "assistant";
    case "function": return "function";
    case "tool": return "tool";
    default: return "user";
  }
}

/**
 * ChatOpenAI — chat model wrapper for OpenAI GPT models.
 * Supports all GPT-4 and GPT-3.5 variants.
 */
export class ChatOpenAI extends BaseChatModel {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private frequencyPenalty: number;
  private presencePenalty: number;

  constructor(config: ChatOpenAIConfig = {}) {
    super(config);
    this.modelName = config.model ?? "gpt-4o";
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com";
    this.organization = config.organization;
    this.frequencyPenalty = config.frequencyPenalty ?? 0;
    this.presencePenalty = config.presencePenalty ?? 0;

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key is required. Pass apiKey in config or set OPENAI_API_KEY env var."
      );
    }
  }

  _modelType(): string {
    return "chat-openai";
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    };
    if (this.organization) {
      headers["OpenAI-Organization"] = this.organization;
    }
    return headers;
  }

  private formatMessages(messages: Message[]): Array<{ role: string; content: string; name?: string }> {
    return messages.map((msg) => {
      const formatted: Record<string, unknown> = {
        role: toOpenAIRole(msg.role),
        content: msg.content
      };

      if (msg.name) formatted["name"] = msg.name;
      if (msg.role === "tool" && msg.toolCallId) {
        formatted["tool_call_id"] = msg.toolCallId;
      }
      if (msg.role === "ai" && msg.toolCalls && msg.toolCalls.length > 0) {
        formatted["tool_calls"] = msg.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments
          }
        }));
      } else if (msg.functionCall) {
        formatted["function_call"] = {
          name: msg.functionCall.name,
          arguments: msg.functionCall.arguments
        };
      }

      return formatted as { role: string; content: string; name?: string };
    });
  }

  private parseAssistantMessage(message: {
    role: string;
    content: string | null;
    refusal?: string | null;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  }): Message {
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type === "function" ? "function" : undefined,
      name: toolCall.function?.name ?? "",
      arguments: toolCall.function?.arguments ?? "{}"
    }));

    return {
      role: "ai",
      content: message.content ?? "",
      refusal: message.refusal ?? undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  private mapToolChoice(toolChoice?: ToolCallOptions["toolChoice"]): unknown {
    if (!toolChoice) return undefined;
    if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") {
      return toolChoice;
    }
    return {
      type: "function",
      function: {
        name: toolChoice.name
      }
    };
  }

  private formatTools(tools: FunctionDefinition[]): Array<{ type: "function"; function: FunctionDefinition }> {
    return tools.map((tool) => ({
      type: "function",
      function: tool
    }));
  }

  async generate(messages: Message[][], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const messageList of messages) {
      const body = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        frequency_penalty: this.frequencyPenalty,
        presence_penalty: this.presencePenalty,
        stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined),
        messages: this.formatMessages(messageList)
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            role: string;
            content: string | null;
            refusal?: string | null;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      };

      const assistantMessage = this.parseAssistantMessage(data.choices[0]?.message ?? {
        role: "assistant",
        content: ""
      });
      const text = assistantMessage.content;
      generations.push([
        {
          text,
          message: assistantMessage,
          generationInfo: {
            finishReason: data.choices[0]?.finish_reason,
            usage: data.usage,
            model: data.model
          }
        }
      ]);
    }

    return { generations };
  }

  async stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void> {
    const body = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      stream: true,
      messages: this.formatMessages(messages)
    };

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI streaming error ${response.status}: ${errorBody}`);
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
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
            };
            const content = parsed.choices[0]?.delta?.content ?? "";
            if (content) {
              await callback({
                text: content,
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
    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      top_p: options?.topP ?? this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined),
      messages: this.formatMessages(messages),
      tools: this.formatTools(tools)
    };

    const toolChoice = this.mapToolChoice(options?.toolChoice);
    if (toolChoice !== undefined) {
      body["tool_choice"] = toolChoice;
    }
    if (options?.parallelToolCalls !== undefined) {
      body["parallel_tool_calls"] = options.parallelToolCalls;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI tool-calling error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          role: string;
          content: string | null;
          refusal?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    return this.parseAssistantMessage(data.choices[0]?.message ?? {
      role: "assistant",
      content: ""
    });
  }

  async generateStructured<T>(
    messages: Message[],
    schema: StructuredOutputSchema,
    options?: RunOptions
  ): Promise<T> {
    const body = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      top_p: options?.topP ?? this.topP,
      frequency_penalty: this.frequencyPenalty,
      presence_penalty: this.presencePenalty,
      stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined),
      messages: this.formatMessages(messages),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          description: schema.description,
          strict: schema.strict ?? true,
          schema: schema.schema
        }
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI structured-output error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          refusal?: string | null;
        };
      }>;
    };

    const message = data.choices[0]?.message;
    if (!message) {
      throw new Error("OpenAI structured-output response did not include a message.");
    }
    if (message.refusal) {
      throw new Error(`OpenAI refused structured output: ${message.refusal}`);
    }

    return this.parseJsonText<T>(message.content ?? "");
  }
}
