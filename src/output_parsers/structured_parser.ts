import { BaseOutputParser } from "./base";
import { JsonOutputParser } from "./json_parser";

/**
 * Schema definition for StructuredOutputParser.
 */
export interface OutputSchema {
  [fieldName: string]: {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    required?: boolean;
  };
}

/**
 * StructuredOutputParser — parse structured fields from LLM output.
 *
 * Attempts JSON parsing first, then falls back to key:value line extraction.
 *
 * @example
 * const parser = StructuredOutputParser.fromNamesAndDescriptions({
 *   name: "The person's name",
 *   age: "The person's age"
 * })
 * parser.parse('name: Alice\nage: 30')
 * // => { name: "Alice", age: "30" }
 */
export class StructuredOutputParser extends BaseOutputParser<Record<string, unknown>> {
  private jsonParser = new JsonOutputParser();

  constructor(private schema: OutputSchema) {
    super();
  }

  /**
   * Create a StructuredOutputParser where all fields are treated as strings.
   */
  static fromNamesAndDescriptions(
    fields: Record<string, string>
  ): StructuredOutputParser {
    const schema: OutputSchema = {};
    for (const [name, description] of Object.entries(fields)) {
      schema[name] = { type: "string", description, required: true };
    }
    return new StructuredOutputParser(schema);
  }

  _type(): string {
    return "structured_output_parser";
  }

  parse(output: string): Record<string, unknown> {
    // 1. Try JSON parsing first
    try {
      const parsed = this.jsonParser.parse(output);
      return this.coerceAllTypes(parsed);
    } catch {
      // Fall through to key:value extraction
    }

    // 2. Fall back to key:value line extraction
    const result: Record<string, unknown> = {};
    const lines = output.split("\n");

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      if (key in this.schema) {
        result[key] = this.coerceValue(key, value);
      }
    }

    return result;
  }

  /**
   * Coerce all values in a parsed object to match their schema types.
   */
  private coerceAllTypes(parsed: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...parsed };
    for (const key of Object.keys(this.schema)) {
      if (key in result) {
        result[key] = this.coerceValue(key, result[key]);
      }
    }
    return result;
  }

  /**
   * Coerce a single value to the schema-defined type for the given key.
   */
  private coerceValue(key: string, value: unknown): unknown {
    const fieldDef = this.schema[key];
    if (!fieldDef) return value;

    switch (fieldDef.type) {
      case "number": {
        const n = Number(value);
        return isNaN(n) ? value : n;
      }
      case "boolean": {
        if (typeof value === "boolean") return value;
        const s = String(value).toLowerCase().trim();
        if (s === "true" || s === "yes" || s === "1") return true;
        if (s === "false" || s === "no" || s === "0") return false;
        return value;
      }
      case "array": {
        if (Array.isArray(value)) return value;
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : value;
          } catch {
            return value;
          }
        }
        return value;
      }
      case "object": {
        if (typeof value === "object" && value !== null) return value;
        if (typeof value === "string") {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      }
      default:
        return String(value ?? "");
    }
  }

  getFormatInstructions(): string {
    const fieldLines = Object.entries(this.schema)
      .map(([name, def]) => {
        const required = def.required !== false ? " (required)" : " (optional)";
        return `- ${name} (${def.type})${required}: ${def.description}`;
      })
      .join("\n");

    const exampleFields = Object.keys(this.schema)
      .map((k) => `  "${k}": <value>`)
      .join(",\n");

    return (
      `You must respond with a JSON object containing the following fields:\n${fieldLines}\n\n` +
      `Format your response as a valid JSON object. Example:\n{\n${exampleFields}\n}`
    );
  }
}
