import type { Message } from "../schema/types";

/**
 * Abstract base class for all prompt templates.
 */
export abstract class BasePromptTemplate {
  abstract inputVariables: string[];

  /**
   * Format the template with the given values and return a string prompt.
   */
  abstract format(values: Record<string, string>): string;

  /**
   * Return the input variables extracted from the template.
   */
  getInputVariables(): string[] {
    return this.inputVariables;
  }

  /**
   * Validate that all required input variables are present.
   */
  protected validateInputs(values: Record<string, string>): void {
    const missing = this.inputVariables.filter((v) => !(v in values));
    if (missing.length > 0) {
      throw new Error(
        `Missing required input variables: ${missing.join(", ")}`
      );
    }
  }

  /**
   * Serialize the prompt template for storage/logging.
   */
  abstract toJSON(): Record<string, unknown>;
}

/**
 * Abstract base class for chat prompt templates.
 */
export abstract class BaseChatPromptTemplate extends BasePromptTemplate {
  /**
   * Format the template and return a list of Messages.
   */
  abstract formatMessages(values: Record<string, string>): Message[];

  format(values: Record<string, string>): string {
    return this.formatMessages(values)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
  }
}
