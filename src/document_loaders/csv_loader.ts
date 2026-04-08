import * as fs from "fs/promises";
import * as path from "path";
import { BaseDocumentLoader } from "./base";
import type { Document } from "../schema/types";

export interface CSVLoaderOptions {
  /** If set, use this column's value as pageContent; all other columns go to metadata. */
  column?: string;
  /** Field separator, defaults to "," */
  separator?: string;
}

/**
 * CSVLoader — load a CSV file, producing one Document per data row.
 *
 * @example
 * // Each row becomes a JSON-stringified Document
 * const loader = new CSVLoader("/data/records.csv")
 *
 * // Use a specific column as page content
 * const loader = new CSVLoader("/data/records.csv", { column: "body" })
 */
export class CSVLoader extends BaseDocumentLoader {
  constructor(
    private filePath: string,
    private options: CSVLoaderOptions = {}
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const absolutePath = path.resolve(this.filePath);
    const content = await fs.readFile(absolutePath, { encoding: "utf-8" });
    const rows = this.parseCSV(content);

    const { column } = this.options;
    const baseMetadata = {
      source: absolutePath,
      fileName: path.basename(absolutePath)
    };

    return rows.map((row, index) => {
      if (column) {
        if (!(column in row)) {
          throw new Error(
            `Column "${column}" not found in CSV. Available columns: ${Object.keys(row).join(", ")}`
          );
        }
        const pageContent = row[column] ?? "";
        const metadata: Record<string, unknown> = { ...baseMetadata, row: index };
        for (const [key, value] of Object.entries(row)) {
          if (key !== column) {
            metadata[key] = value;
          }
        }
        return { pageContent, metadata };
      } else {
        return {
          pageContent: JSON.stringify(row),
          metadata: { ...baseMetadata, row: index }
        };
      }
    });
  }

  /**
   * Parse CSV content into an array of row objects.
   * Handles:
   * - Custom separators
   * - Quoted fields (with escaped quotes inside)
   * - CRLF and LF line endings
   * - Empty rows (skipped)
   */
  private parseCSV(content: string): Record<string, string>[] {
    const separator = this.options.separator ?? ",";

    // Normalize line endings
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");

    if (lines.length === 0) return [];

    // Parse header row
    const headers = this.parseLine(lines[0], separator);
    if (headers.length === 0) return [];

    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue; // skip empty lines

      const values = this.parseLine(line, separator);
      const row: Record<string, string> = {};

      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? "";
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse a single CSV line into an array of field values.
   * Handles quoted fields that may contain the separator or newlines.
   */
  private parseLine(line: string, separator: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote ("")
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i += 2;
            continue;
          }
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
        current += char;
        i++;
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
          continue;
        }
        if (line.startsWith(separator, i)) {
          fields.push(current.trim());
          current = "";
          i += separator.length;
          continue;
        }
        current += char;
        i++;
      }
    }

    // Push the last field
    fields.push(current.trim());

    return fields;
  }
}
