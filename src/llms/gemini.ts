import { BaseLLM, type BaseLLMConfig } from "./base";
import type { LLMResult, RunOptions } from "../schema/types";
import { ChatGemini, type ChatGeminiConfig } from "../chat_models/gemini";

export interface GeminiLLMConfig extends BaseLLMConfig, Omit<ChatGeminiConfig, keyof BaseLLMConfig> {}

export class GeminiLLM extends BaseLLM {
  modelName: string;
  private chatModel: ChatGemini;

  constructor(config: GeminiLLMConfig = {}) {
    super(config);
    this.chatModel = new ChatGemini(config);
    this.modelName = this.chatModel.modelName;
  }

  _llmType(): string {
    return "gemini";
  }

  async generate(prompts: string[], options?: RunOptions): Promise<LLMResult> {
    const generations: LLMResult["generations"] = [];

    for (const prompt of prompts) {
      const result = await this.chatModel.generate([[{ role: "human", content: prompt }]], options);
      generations.push(result.generations[0]);
    }

    return {
      generations,
      llmOutput: {
        model: this.modelName
      }
    };
  }
}
