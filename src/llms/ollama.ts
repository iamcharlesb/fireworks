import { BaseLLM, type BaseLLMConfig } from "./base";
import type { LLMResult, RunOptions, StreamCallback } from "../schema/types";

export interface OllamaLLMConfig extends BaseLLMConfig {
  model?: string;
  baseUrl?: string;
  keepAlive?: string;
}

/**
 * Ollama local LLM. Connects to a locally running Ollama server.
 * Default base URL: http://localhost:11434
 */
export class OllamaLLM extends BaseLLM {
  modelName: string;
  private baseUrl: string;
  private keepAlive: string;

  constructor(config: OllamaLLMConfig = {}) {
    super(config);
    this.modelName = config.model ?? "llama3.2";
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    this.keepAlive = config.keepAlive ?? "5m";
  }

  _llmType(): string {
    return "ollama";
  }

  async generate(prompts: string[], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const prompt of prompts) {
      const body = {
        model: this.modelName,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? this.temperature,
          top_p: options?.topP ?? this.topP,
          num_predict: options?.maxTokens ?? this.maxTokens,
          stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined)
        },
        keep_alive: this.keepAlive
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        response: string;
        done: boolean;
        prompt_eval_count?: number;
        eval_count?: number;
        done_reason?: string;
      };

      generations.push([
        {
          text: data.response,
          generationInfo: {
            done: data.done,
            doneReason: data.done_reason,
            promptEvalCount: data.prompt_eval_count,
            evalCount: data.eval_count
          }
        }
      ]);
    }

    return { generations };
  }

  async stream(prompt: string, callback: StreamCallback, options?: RunOptions): Promise<void> {
    const body = {
      model: this.modelName,
      prompt,
      stream: true,
      options: {
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        num_predict: options?.maxTokens ?? this.maxTokens
      },
      keep_alive: this.keepAlive
    };

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama streaming error ${response.status}: ${errorBody}`);
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
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line) as {
              response: string;
              done: boolean;
            };

            if (parsed.response) {
              await callback({
                text: parsed.response,
                isFirst,
                isFinal: parsed.done,
                metadata: { model: this.modelName }
              });
              isFirst = false;
            }

            if (parsed.done) return;
          } catch {
            // Ignore malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
