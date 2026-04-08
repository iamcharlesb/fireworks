import { BaseLLM, type BaseLLMConfig } from "./base";
import type { LLMResult, RunOptions, StreamCallback, StreamingChunk } from "../schema/types";

export interface AnthropicLLMConfig extends BaseLLMConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

/**
 * Anthropic Claude text completion LLM.
 * Uses the /v1/messages endpoint with a single user turn.
 */
export class Anthropic extends BaseLLM {
  modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private anthropicVersion: string;

  constructor(config: AnthropicLLMConfig = {}) {
    super(config);
    this.modelName = config.model ?? "claude-3-5-sonnet-20241022";
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com";
    this.anthropicVersion = config.anthropicVersion ?? "2023-06-01";

    if (!this.apiKey) {
      throw new Error(
        "Anthropic API key is required. Pass apiKey in config or set ANTHROPIC_API_KEY env var."
      );
    }
  }

  _llmType(): string {
    return "anthropic";
  }

  async generate(prompts: string[], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const prompt of prompts) {
      const body = {
        model: this.modelName,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        stop_sequences: options?.stop ?? this.stop.length > 0 ? this.stop : undefined,
        messages: [{ role: "user", content: prompt }]
      };

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
        throw new Error(
          `Anthropic API error ${response.status}: ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage?: { input_tokens: number; output_tokens: number };
        stop_reason?: string;
      };

      const text = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      generations.push([
        {
          text,
          generationInfo: {
            stopReason: data.stop_reason,
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
          if (data === "[DONE]") continue;

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

    // Send final empty chunk to signal end of stream
    await callback({
      text: "",
      isFirst: false,
      isFinal: true,
      metadata: { model: this.modelName }
    });
  }
}
