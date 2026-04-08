import { BaseLLM, type BaseLLMConfig } from "./base";
import type { LLMResult, RunOptions, StreamCallback } from "../schema/types";

export interface OpenAILLMConfig extends BaseLLMConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * OpenAI text completion LLM (wraps the chat completions endpoint
 * using a single user message for simplicity).
 */
export class OpenAI extends BaseLLM {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private organization?: string;

  constructor(config: OpenAILLMConfig = {}) {
    super(config);
    this.modelName = config.model ?? "gpt-4o";
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com";
    this.organization = config.organization;

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key is required. Pass apiKey in config or set OPENAI_API_KEY env var."
      );
    }
  }

  _llmType(): string {
    return "openai";
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

  async generate(prompts: string[], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const prompt of prompts) {
      const body = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined),
        messages: [{ role: "user", content: prompt }]
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
          message: { role: string; content: string };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const text = data.choices[0]?.message.content ?? "";
      generations.push([
        {
          text,
          generationInfo: {
            finishReason: data.choices[0]?.finish_reason,
            usage: data.usage
          }
        }
      ]);
    }

    return { generations };
  }

  async stream(prompt: string, callback: StreamCallback, options?: RunOptions): Promise<void> {
    const body = {
      model: this.modelName,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      temperature: options?.temperature ?? this.temperature,
      stream: true,
      messages: [{ role: "user", content: prompt }]
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
              choices: Array<{ delta: { content?: string }; finish_reason?: string }>;
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
}
