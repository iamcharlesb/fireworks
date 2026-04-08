import { BasePromptTemplate } from "./base";

/**
 * A simple string prompt template with {variable} substitution.
 *
 * @example
 * const prompt = new PromptTemplate("Tell me a joke about {topic}", ["topic"])
 * prompt.format({ topic: "cats" }) // "Tell me a joke about cats"
 *
 * @example
 * const prompt = PromptTemplate.fromTemplate("Summarize: {text}")
 * // inputVariables = ["text"] is inferred automatically
 */
export class PromptTemplate extends BasePromptTemplate {
  inputVariables: string[];
  private template: string;
  private templateFormat: "f-string" | "mustache";

  constructor(
    template: string,
    inputVariables?: string[],
    options?: { templateFormat?: "f-string" | "mustache" }
  ) {
    super();
    this.template = template;
    this.templateFormat = options?.templateFormat ?? "f-string";
    this.inputVariables = inputVariables ?? this.extractVariables(template);
  }

  /** Extract {variable} placeholders from a template string */
  private extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{([^{}]+)\}/g);
    const vars = new Set<string>();
    for (const match of matches) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }

  /**
   * Create a PromptTemplate from a string, auto-extracting variables.
   */
  static fromTemplate(template: string): PromptTemplate {
    return new PromptTemplate(template);
  }

  /**
   * Format the template by substituting all {variable} placeholders.
   */
  format(values: Record<string, string>): string {
    this.validateInputs(values);
    return this.template.replace(/\{([^{}]+)\}/g, (_, key) => {
      const value = values[key];
      return value !== undefined ? value : `{${key}}`;
    });
  }

  /**
   * Partial — return a new template with some variables pre-filled.
   */
  partial(partialValues: Record<string, string>): PromptTemplate {
    const remainingVars = this.inputVariables.filter(
      (v) => !(v in partialValues)
    );
    const preFilledTemplate = new PromptTemplate(
      this.template,
      remainingVars
    );
    // Store partial values so format() can merge them
    preFilledTemplate.format = (values: Record<string, string>) => {
      const merged = { ...partialValues, ...values };
      preFilledTemplate.validateInputs(merged);
      return this.template.replace(/\{([^{}]+)\}/g, (_, key) => {
        const value = merged[key];
        return value !== undefined ? value : `{${key}}`;
      });
    };
    return preFilledTemplate;
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "prompt_template",
      template: this.template,
      inputVariables: this.inputVariables,
      templateFormat: this.templateFormat
    };
  }
}
