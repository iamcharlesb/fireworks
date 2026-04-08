import { BaseChatPromptTemplate } from "./base";
import { PromptTemplate } from "./prompt_template";
import type { Message, MessageRole } from "../schema/types";

/** A template for a single message in a chat prompt */
export interface MessageTemplate {
  role: MessageRole;
  template: string;
}

/**
 * A template that produces a list of Messages for chat models.
 *
 * @example
 * const prompt = ChatPromptTemplate.fromMessages([
 *   ["system", "You are a helpful {role}."],
 *   ["human", "{question}"]
 * ])
 * const messages = prompt.formatMessages({ role: "assistant", question: "Hello?" })
 */
export class ChatPromptTemplate extends BaseChatPromptTemplate {
  inputVariables: string[];
  private messageTemplates: MessageTemplate[];
  private promptTemplates: PromptTemplate[];

  constructor(messageTemplates: MessageTemplate[]) {
    super();
    this.messageTemplates = messageTemplates;
    this.promptTemplates = messageTemplates.map(
      (mt) => new PromptTemplate(mt.template)
    );

    // Collect all unique variables across all message templates
    const allVars = new Set<string>();
    for (const pt of this.promptTemplates) {
      for (const v of pt.getInputVariables()) {
        allVars.add(v);
      }
    }
    this.inputVariables = Array.from(allVars);
  }

  /**
   * Create a ChatPromptTemplate from an array of [role, template] tuples.
   */
  static fromMessages(
    templates: Array<[MessageRole | string, string]>
  ): ChatPromptTemplate {
    const messageTemplates: MessageTemplate[] = templates.map(([role, template]) => ({
      role: role as MessageRole,
      template
    }));
    return new ChatPromptTemplate(messageTemplates);
  }

  /**
   * Format all message templates and return the resulting Message array.
   */
  formatMessages(values: Record<string, string>): Message[] {
    return this.messageTemplates.map((mt, index) => ({
      role: mt.role,
      content: this.promptTemplates[index].format(values)
    }));
  }

  /**
   * Partial — pre-fill some variables.
   */
  partial(partialValues: Record<string, string>): ChatPromptTemplate {
    const remainingVars = this.inputVariables.filter(
      (v) => !(v in partialValues)
    );

    const partialTemplate = new ChatPromptTemplate(this.messageTemplates);
    partialTemplate.inputVariables = remainingVars;
    partialTemplate.formatMessages = (values: Record<string, string>) => {
      const merged = { ...partialValues, ...values };
      return this.formatMessages(merged);
    };
    return partialTemplate;
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "chat_prompt_template",
      messages: this.messageTemplates,
      inputVariables: this.inputVariables
    };
  }
}
