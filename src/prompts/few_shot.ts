import { BasePromptTemplate } from "./base";
import { PromptTemplate } from "./prompt_template";

export interface FewShotExample {
  [key: string]: string;
}

export interface FewShotPromptTemplateConfig {
  examples: FewShotExample[];
  examplePrompt: PromptTemplate;
  prefix?: string;
  suffix: string;
  inputVariables: string[];
  exampleSeparator?: string;
}

/**
 * FewShotPromptTemplate — builds prompts that include worked examples
 * before the actual question/task.
 *
 * @example
 * const examplePrompt = PromptTemplate.fromTemplate("Q: {question}\nA: {answer}")
 * const examples = [
 *   { question: "What is 2+2?", answer: "4" },
 *   { question: "Capital of France?", answer: "Paris" }
 * ]
 * const prompt = new FewShotPromptTemplate({
 *   examples,
 *   examplePrompt,
 *   suffix: "Q: {input}\nA:",
 *   inputVariables: ["input"]
 * })
 */
export class FewShotPromptTemplate extends BasePromptTemplate {
  inputVariables: string[];
  private examples: FewShotExample[];
  private examplePrompt: PromptTemplate;
  private prefix: string;
  private suffix: string;
  private exampleSeparator: string;

  constructor(config: FewShotPromptTemplateConfig) {
    super();
    this.examples = config.examples;
    this.examplePrompt = config.examplePrompt;
    this.prefix = config.prefix ?? "";
    this.suffix = config.suffix;
    this.inputVariables = config.inputVariables;
    this.exampleSeparator = config.exampleSeparator ?? "\n\n";
  }

  /**
   * Format the few-shot prompt with the given values.
   * Includes prefix, formatted examples, then suffix.
   */
  format(values: Record<string, string>): string {
    this.validateInputs(values);

    const formattedExamples = this.examples.map((example) =>
      this.examplePrompt.format(example as Record<string, string>)
    );

    const parts: string[] = [];
    if (this.prefix) {
      parts.push(this.prefix);
    }
    parts.push(...formattedExamples);

    // Format suffix with provided values
    const formattedSuffix = this.suffix.replace(/\{([^{}]+)\}/g, (_, key) => {
      return values[key] ?? `{${key}}`;
    });
    parts.push(formattedSuffix);

    return parts.join(this.exampleSeparator);
  }

  /**
   * Return a new template using only a subset of examples (e.g. selected by similarity).
   */
  withExamples(examples: FewShotExample[]): FewShotPromptTemplate {
    return new FewShotPromptTemplate({
      examples,
      examplePrompt: this.examplePrompt,
      prefix: this.prefix,
      suffix: this.suffix,
      inputVariables: this.inputVariables,
      exampleSeparator: this.exampleSeparator
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      _type: "few_shot_prompt_template",
      examples: this.examples,
      prefix: this.prefix,
      suffix: this.suffix,
      inputVariables: this.inputVariables,
      exampleSeparator: this.exampleSeparator
    };
  }
}
