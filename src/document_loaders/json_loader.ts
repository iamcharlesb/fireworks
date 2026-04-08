import * as fs from "fs/promises";
import * as path from "path";
import { BaseDocumentLoader } from "./base";
import type { Document } from "../schema/types";

/**
 * JSONLoader — load a JSON file as Document(s).
 *
 * - Without a jsonPointer: creates one Document for the entire JSON (stringified).
 * - With a jsonPointer (e.g. "/messages"): extracts that path and creates one Document per array item.
 *
 * @example
 * // Load entire file
 * const loader = new JSONLoader("/data/info.json")
 *
 * // Extract a nested array
 * const loader = new JSONLoader("/data/chat.json", "/messages")
 */
export class JSONLoader extends BaseDocumentLoader {
  constructor(
    private filePath: string,
    private jsonPointer?: string
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const absolutePath = path.resolve(this.filePath);
    const raw = await fs.readFile(absolutePath, { encoding: "utf-8" });
    const data: unknown = JSON.parse(raw);

    const baseMetadata = {
      source: absolutePath,
      fileName: path.basename(absolutePath)
    };

    if (!this.jsonPointer) {
      // Entire file as one document
      return [
        {
          pageContent: JSON.stringify(data, null, 2),
          metadata: baseMetadata
        }
      ];
    }

    // Extract the items at the given JSON pointer path
    const items = this.extractByPointer(data, this.jsonPointer);

    return items.map((item, index) => ({
      pageContent: typeof item === "string" ? item : JSON.stringify(item, null, 2),
      metadata: {
        ...baseMetadata,
        jsonPointer: this.jsonPointer,
        index
      }
    }));
  }

  /**
   * Extract a value by JSON Pointer (RFC 6901) and return it as an array.
   * If the extracted value is already an array, return it directly.
   * Otherwise wrap it in a single-element array.
   */
  private extractByPointer(data: unknown, pointer: string): unknown[] {
    // Normalize: ensure pointer starts with "/"
    const normalized = pointer.startsWith("/") ? pointer : `/${pointer}`;
    // Split and decode each token (RFC 6901 escapes: ~1 = /, ~0 = ~)
    const tokens = normalized
      .slice(1)
      .split("/")
      .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));

    let current: unknown = data;
    for (const token of tokens) {
      if (current === null || current === undefined) {
        return [];
      }
      if (Array.isArray(current)) {
        const idx = parseInt(token, 10);
        current = isNaN(idx) ? undefined : current[idx];
      } else if (typeof current === "object") {
        current = (current as Record<string, unknown>)[token];
      } else {
        return [];
      }
    }

    if (Array.isArray(current)) return current;
    if (current === undefined || current === null) return [];
    return [current];
  }
}
