import { BaseOutputParser } from "./base";

/**
 * CommaSeparatedListOutputParser — parse a comma-separated list from LLM output.
 *
 * @example
 * const parser = new CommaSeparatedListOutputParser()
 * parser.parse("apple, banana, cherry")
 * // => ["apple", "banana", "cherry"]
 */
export class CommaSeparatedListOutputParser extends BaseOutputParser<string[]> {
  _type(): string {
    return "comma_separated_list";
  }

  parse(output: string): string[] {
    return output
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  getFormatInstructions(): string {
    return "Your response should be a comma-separated list of values, e.g.: value1, value2, value3";
  }
}

/**
 * NumberedListOutputParser — parse a numbered list from LLM output.
 *
 * Handles formats like:
 * - "1. Item one"
 * - "1) Item one"
 * - "1: Item one"
 *
 * @example
 * const parser = new NumberedListOutputParser()
 * parser.parse("1. First\n2. Second\n3. Third")
 * // => ["First", "Second", "Third"]
 */
export class NumberedListOutputParser extends BaseOutputParser<string[]> {
  _type(): string {
    return "numbered_list";
  }

  parse(output: string): string[] {
    const results: string[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Match lines starting with a number followed by ., ), or :
      const match = trimmed.match(/^\d+[.):\s]\s*(.+)$/);
      if (match && match[1]) {
        results.push(match[1].trim());
      }
    }

    return results;
  }

  getFormatInstructions(): string {
    return (
      "Your response should be a numbered list, one item per line. " +
      'Example:\n1. First item\n2. Second item\n3. Third item'
    );
  }
}

/**
 * LineOutputParser — parse a newline-separated list from LLM output.
 *
 * @example
 * const parser = new LineOutputParser()
 * parser.parse("First line\nSecond line\nThird line")
 * // => ["First line", "Second line", "Third line"]
 */
export class LineOutputParser extends BaseOutputParser<string[]> {
  _type(): string {
    return "line_list";
  }

  parse(output: string): string[] {
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  getFormatInstructions(): string {
    return "Your response should be a list of items, one item per line.";
  }
}
