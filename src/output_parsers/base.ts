/**
 * BaseOutputParser — abstract base for parsing LLM string output into typed values.
 */
export abstract class BaseOutputParser<T = string> {
  /**
   * Parse the raw LLM output string into type T.
   */
  abstract parse(output: string): T;

  /**
   * Return format instructions to embed in prompts, so the LLM produces
   * output that this parser can reliably handle.
   */
  getFormatInstructions(): string {
    return "";
  }

  /**
   * Parse with contextual error handling. If parsing fails, the prompt is
   * included in the thrown error for debugging.
   */
  parseWithPrompt(output: string, prompt: string): T {
    try {
      return this.parse(output);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Failed to parse LLM output: ${message}\n\nPrompt was:\n${prompt}\n\nOutput was:\n${output}`
      );
    }
  }

  /**
   * Unique type identifier for this parser.
   */
  abstract _type(): string;
}
