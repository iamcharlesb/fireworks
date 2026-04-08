import { BaseChatModel, type BaseChatModelConfig } from "./base";
import type { Message, LLMResult, RunOptions, StreamCallback } from "../schema/types";

export interface ChatOllamaConfig extends BaseChatModelConfig {
  model?: string;
  baseUrl?: string;
  keepAlive?: string;
  format?: "json" | "";
}

function toOllamaRole(role: string): "system" | "user" | "assistant" | "tool" {
  switch (role) {
    case "system": return "system";
    case "human": return "user";
    case "ai": return "assistant";
    case "tool":
    case "function": return "tool";
    default: return "user";
  }
}

/**
 * ChatOllama — chat model for locally running Ollama models.
 * Supports llama3.2, qwen2.5-coder, mistral, phi-4, and others.
 */
export class ChatOllama extends BaseChatModel {
  modelName: string;
  private baseUrl: string;
  private keepAlive: string;
  private format: string;

  constructor(config: ChatOllamaConfig = {}) {
    super(config);
    this.modelName = config.model ?? "llama3.2";
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    this.keepAlive = config.keepAlive ?? "5m";
    this.format = config.format ?? "";
  }

  _modelType(): string {
    return "chat-ollama";
  }

  private formatMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      role: toOllamaRole(msg.role),
      content: msg.content
    }));
  }

  async generate(messages: Message[][], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const messageList of messages) {
      const body: Record<string, unknown> = {
        model: this.modelName,
        stream: false,
        messages: this.formatMessages(messageList),
        options: {
          temperature: options?.temperature ?? this.temperature,
          top_p: options?.topP ?? this.topP,
          num_predict: options?.maxTokens ?? this.maxTokens,
          stop: options?.stop ?? (this.stop.length > 0 ? this.stop : undefined)
        },
        keep_alive: this.keepAlive
      };

      if (this.format) body["format"] = this.format;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout ?? this.timeout);

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/chat`, {
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
        message: { role: string; content: string };
        done: boolean;
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const text = data.message.content;
      generations.push([
        {
          text,
          message: { role: "ai", content: text },
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

  async stream(messages: Message[], callback: StreamCallback, options?: RunOptions): Promise<void> {
    const body: Record<string, unknown> = {
      model: this.modelName,
      stream: true,
      messages: this.formatMessages(messages),
      options: {
        temperature: options?.temperature ?? this.temperature,
        top_p: options?.topP ?? this.topP,
        num_predict: options?.maxTokens ?? this.maxTokens
      },
      keep_alive: this.keepAlive
    };

    if (this.format) body["format"] = this.format;

    const response = await fetch(`${this.baseUrl}/api/chat`, {
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
              message: { content: string };
              done: boolean;
            };

            if (parsed.message?.content) {
              await callback({
                text: parsed.message.content,
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
