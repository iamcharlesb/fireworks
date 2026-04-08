import { BaseOutputParser } from "./base";

/**
 * ParseError — thrown when JSON parsing fails.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly output: string
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * JsonOutputParser — extracts and parses JSON from LLM output.
 *
 * Handles:
 * - Markdown code fences: ```json ... ``` or ``` ... ```
 * - Raw JSON objects or arrays
 * - JSON embedded within surrounding text
 *
 * @example
 * const parser = new JsonOutputParser()
 * parser.parse('```json\n{"key": "value"}\n```')
 * // => { key: "value" }
 */
export class JsonOutputParser extends BaseOutputParser<Record<string, unknown>> {
  _type(): string {
    return "json_output_parser";
  }

  parse(output: string): Record<string, unknown> {
    let text = output.trim();

    // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    // 2. Try parsing the cleaned text directly
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      throw new ParseError(
        `Parsed value is not an object or array: ${typeof parsed}`,
        output
      );
    } catch (e) {
      if (e instanceof ParseError) throw e;
      // Fall through to extraction
    }

    // 3. Find the first JSON object or array within the text
    const objectStart = text.indexOf("{");
    const arrayStart = text.indexOf("[");

    let start = -1;
    let endChar = "";

    if (objectStart === -1 && arrayStart === -1) {
      throw new ParseError("No JSON object or array found in output", output);
    } else if (objectStart === -1) {
      start = arrayStart;
      endChar = "]";
    } else if (arrayStart === -1) {
      start = objectStart;
      endChar = "}";
    } else {
      // Pick whichever comes first
      if (objectStart < arrayStart) {
        start = objectStart;
        endChar = "}";
      } else {
        start = arrayStart;
        endChar = "]";
      }
    }

    // Find the matching closing bracket by tracking depth
    let depth = 0;
    let end = -1;
    const openChar = endChar === "}" ? "{" : "[";

    for (let i = start; i < text.length; i++) {
      if (text[i] === openChar) depth++;
      else if (text[i] === endChar) {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      throw new ParseError("Could not find matching closing bracket in output", output);
    }

    const jsonStr = text.slice(start, end + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      throw new ParseError(
        `Parsed value is not an object or array: ${typeof parsed}`,
        output
      );
    } catch (e) {
      if (e instanceof ParseError) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new ParseError(`Invalid JSON: ${message}`, output);
    }
  }

  getFormatInstructions(): string {
    return "Respond with a valid JSON object.";
  }
}
