import { BaseLLM, type BaseLLMConfig } from "./base";
import type { LLMResult, RunOptions, StreamCallback } from "../schema/types";

export interface PerplexityLLMConfig extends BaseLLMConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Perplexity AI LLM — uses the OpenAI-compatible chat completions API.
 * Specialized models have real-time web search built in.
 */
export class PerplexityLLM extends BaseLLM {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: PerplexityLLMConfig = {}) {
    super(config);
    this.modelName = config.model ?? "llama-3.1-sonar-large-128k-online";
    this.apiKey = config.apiKey ?? process.env.PERPLEXITY_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.perplexity.ai";

    if (!this.apiKey) {
      throw new Error(
        "Perplexity API key is required. Pass apiKey in config or set PERPLEXITY_API_KEY env var."
      );
    }
  }

  _llmType(): string {
    return "perplexity";
  }

  async generate(prompts: string[], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const prompt of prompts) {
      const body = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        messages: [{ role: "user", content: prompt }]
      };

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
          generationInfo: {
            finishReason: data.choices[0]?.finish_reason,
            usage: data.usage,
            citations: data.citations
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
