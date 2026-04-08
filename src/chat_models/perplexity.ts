import { BaseChatModel, type BaseChatModelConfig } from "./base";
import type { Message, LLMResult, RunOptions, StreamCallback } from "../schema/types";

export interface ChatPerplexityConfig extends BaseChatModelConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  returnCitations?: boolean;
  returnImages?: boolean;
}

function toPerplexityRole(role: string): "system" | "user" | "assistant" {
  switch (role) {
    case "system": return "system";
    case "human": return "user";
    case "ai": return "assistant";
    default: return "user";
  }
}

/**
 * ChatPerplexity — chat model for Perplexity AI.
 * Uses OpenAI-compatible format. Online models include web search.
 */
export class ChatPerplexity extends BaseChatModel {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private returnCitations: boolean;
  private returnImages: boolean;

  constructor(config: ChatPerplexityConfig = {}) {
    super(config);
    this.modelName = config.model ?? "llama-3.1-sonar-large-128k-online";
    this.apiKey = config.apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.perplexity.ai";
    this.returnCitations = config.returnCitations ?? false;
    this.returnImages = config.returnImages ?? false;

    if (!this.apiKey) {
      throw new Error(
        "Perplexity API key is required. Pass apiKey in config or set PERPLEXITY_API_KEY env var."
      );
    }
  }

  _modelType(): string {
    return "chat-perplexity";
  }

  private formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      role: toPerplexityRole(msg.role),
      content: msg.content
    }));
  }

  async generate(messages: Message[][], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const messageList of messages) {
      const body: Record<string, unknown> = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        messages: this.formatMessages(messageList)
      };

      if (this.returnCitations) body["return_citations"] = true;
      if (this.returnImages) body["return_images"] = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Perplexity API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        citations?: string[];
      };

      const text = data.choices[0]?.message.content ?? "";
      generations.push([
        {
          text,
          message: { role: "ai", content: text },
          generationInfo: {
            finishReason: data.choices[0]?.finish_reason,
            usage: data.usage,
            citations: data.citations ?? []
          }
        }
      ]);
    }

    return { generations };
  }

  async stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      stream: true,
      messages: this.formatMessages(messages)
    };

    if (this.returnCitations) body["return_citations"] = true;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Perplexity streaming error ${response.status}: ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body reader");

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
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = parsed.choices[0]?.delta?.content ?? "";
            if (content) {
              await callback({ text: content, isFirst, isFinal: false, metadata: { model: this.modelName } });
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

    await callback({ text: "", isFirst: false, isFinal: true, metadata: { model: this.modelName } });
  }
}
