import { BasePromptTemplate } from "./base";
import { PromptTemplate } from "./prompt_template";
import type { Message } from "../schema/types";

/**
 * SystemMessagePromptTemplate — wraps a PromptTemplate to always produce
 * a system-role Message. Useful in ChatPromptTemplate constructions.
 *
 * @example
 * const systemPrompt = SystemMessagePromptTemplate.fromTemplate(
 *   "You are an expert in {domain}."
 * )
 * const message = systemPrompt.formatMessage({ domain: "TypeScript" })
 * // { role: "system", content: "You are an expert in TypeScript." }
 */
export class SystemMessagePromptTemplate extends BasePromptTemplate {
  inputVariables: string[];
  private promptTemplate: PromptTemplate;

  constructor(promptTemplate: PromptTemplate) {
    super();
    this.promptTemplate = promptTemplate;
    this.inputVariables = promptTemplate.getInputVariables();
  }

  static fromTemplate(template: string): SystemMessagePromptTemplate {
    return new SystemMessagePromptTemplate(PromptTemplate.fromTemplate(template));
  }

  format(values: Record<string, string>): string {
    return this.promptTemplate.format(values);
  }

  formatMessage(values: Record<string, string>): Message {
    return {
      role: "system",
      content: this.format(values)
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "system_message_prompt_template",
      prompt: this.promptTemplate.toJSON()
    };
  }
}

/**
 * HumanMessagePromptTemplate — always produces a human-role Message.
 */
export class HumanMessagePromptTemplate extends BasePromptTemplate {
  inputVariables: string[];
  private promptTemplate: PromptTemplate;

  constructor(promptTemplate: PromptTemplate) {
    super();
    this.promptTemplate = promptTemplate;
    this.inputVariables = promptTemplate.getInputVariables();
  }

  static fromTemplate(template: string): HumanMessagePromptTemplate {
    return new HumanMessagePromptTemplate(PromptTemplate.fromTemplate(template));
  }

  format(values: Record<string, string>): string {
    return this.promptTemplate.format(values);
  }

  formatMessage(values: Record<string, string>): Message {
    return {
      role: "human",
      content: this.format(values)
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "human_message_prompt_template",
      prompt: this.promptTemplate.toJSON()
    };
  }
}

/**
 * AIMessagePromptTemplate — always produces an ai-role Message.
 */
export class AIMessagePromptTemplate extends BasePromptTemplate {
  inputVariables: string[];
  private promptTemplate: PromptTemplate;

  constructor(promptTemplate: PromptTemplate) {
    super();
    this.promptTemplate = promptTemplate;
    this.inputVariables = promptTemplate.getInputVariables();
  }

  static fromTemplate(template: string): AIMessagePromptTemplate {
    return new AIMessagePromptTemplate(PromptTemplate.fromTemplate(template));
  }

  format(values: Record<string, string>): string {
    return this.promptTemplate.format(values);
  }

  formatMessage(values: Record<string, string>): Message {
    return {
      role: "ai",
      content: this.format(values)
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "ai_message_prompt_template",
      prompt: this.promptTemplate.toJSON()
    };
  }
}
