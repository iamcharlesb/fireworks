import { BaseChatModel, type BaseChatModelConfig } from "./base";
import type {
  FunctionDefinition,
  LLMResult,
  Message,
  RunOptions,
  StructuredOutputSchema,
  ToolCall,
  ToolCallOptions
} from "../schema/types";

export interface ChatGeminiConfig extends BaseChatModelConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response?: Record<string, unknown> };
}

function toGeminiRole(role: Message["role"]): "user" | "model" {
  return role === "ai" ? "model" : "user";
}

export class ChatGemini extends BaseChatModel {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ChatGeminiConfig = {}) {
    super(config);
    this.modelName = config.model ?? "gemini-2.0-flash";
    this.apiKey = config.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://generativelanguage.googleapis.com";

    if (!this.apiKey) {
      throw new Error(
        "Gemini API key is required. Pass apiKey in config or set GEMINI_API_KEY env var."
      );
    }
  }

  _modelType(): string {
    return "chat-gemini";
  }

  private endpoint(action: string): string {
    return `${this.baseUrl}/v1beta/models/${this.modelName}:${action}?key=${encodeURIComponent(this.apiKey)}`;
  }

  private formatMessages(messages: Message[]): Array<{ role: "user" | "model"; parts: GeminiPart[] }> {
    return messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: message.name ?? message.toolCallId ?? "tool",
                response: {
                  output: message.content
                }
              }
            }
          ]
        };
      }

      if (message.role === "ai" && message.toolCalls?.length) {
        return {
          role: "model",
          parts: message.toolCalls.map((toolCall) => ({
            functionCall: {
              name: toolCall.name,
              args: JSON.parse(toolCall.arguments || "{}") as Record<string, unknown>
            }
          }))
        };
      }

      return {
        role: toGeminiRole(message.role),
        parts: [{ text: message.content }]
      };
    });
  }

  private buildGenerationConfig(options?: RunOptions): Record<string, unknown> {
    return {
      temperature: options?.temperature ?? this.temperature,
      topP: options?.topP ?? this.topP,
      maxOutputTokens: options?.maxTokens ?? this.maxTokens,
      stopSequences: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined)
    };
  }

  private parseCandidate(candidate: {
    content?: {
      parts?: GeminiPart[];
    };
  }): Message {
    const parts = candidate.content?.parts ?? [];
    const toolCalls: ToolCall[] = parts
      .filter((part) => part.functionCall)
      .map((part) => ({
        type: "function",
        name: part.functionCall?.name ?? "",
        arguments: JSON.stringify(part.functionCall?.args ?? {})
      }));

    return {
      role: "ai",
      content: parts
        .map((part) => part.text ?? "")
        .filter(Boolean)
        .join(""),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  async generate(messages: Message[][], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const messageBatch of messages) {
      const response = await fetch(this.endpoint("generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: this.formatMessages(messageBatch),
          generationConfig: this.buildGenerationConfig(options)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: GeminiPart[] };
          finishReason?: string;
        }>;
        usageMetadata?: Record<string, unknown>;
      };

      const message = this.parseCandidate(data.candidates?.[0] ?? {});
      generations.push([
        {
          text: message.content,
          message,
          generationInfo: {
            finishReason: data.candidates?.[0]?.finishReason,
            usage: data.usageMetadata,
            model: this.modelName
          }
        }
      ]);
    }

    return {
      generations,
      llmOutput: {
        usage: generations[0]?.[0]?.generationInfo?.usage,
        model: this.modelName
      }
    };
  }

  async callWithTools(
    messages: Message[],
    tools: FunctionDefinition[],
    options?: ToolCallOptions
  ): Promise<Message> {
    const response = await fetch(this.endpoint("generateContent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: this.formatMessages(messages),
        generationConfig: this.buildGenerationConfig(options),
        tools: [
          {
            functionDeclarations: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters
            }))
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini tool-calling error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: GeminiPart[] };
      }>;
    };

    return this.parseCandidate(data.candidates?.[0] ?? {});
  }

  async generateStructured<T>(
    messages: Message[],
    schema: StructuredOutputSchema,
    options?: RunOptions
  ): Promise<T> {
    const response = await fetch(this.endpoint("generateContent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: this.formatMessages(messages),
        generationConfig: {
          ...this.buildGenerationConfig(options),
          responseMimeType: "application/json",
          responseSchema: schema.schema
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini structured-output error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: GeminiPart[] };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .filter(Boolean)
        .join("") ?? "";

    return this.parseJsonText<T>(text);
  }
}

