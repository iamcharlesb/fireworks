import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

export type DocumentFormat = "txt" | "md" | "html" | "json" | "csv";

export interface DocumentToolConfig extends BaseToolConfig {
  outputDir?: string;
  defaultFormat?: DocumentFormat;
}

/**
 * DocumentTool — generate documents in various formats (txt, md, html, json, csv).
 *
 * Input format (JSON):
 * {
 *   "title": "My Document",
 *   "content": "The document body text...",
 *   "format": "md",          // optional, defaults to "md"
 *   "filename": "output.md", // optional, auto-generated if omitted
 *   "metadata": { ... }      // optional
 * }
 *
 * @example
 * const doc = new DocumentTool({ outputDir: "./output" })
 * await doc.run(JSON.stringify({ title: "Report", content: "# My Report\n...", format: "md" }))
 */
export class DocumentTool extends BaseTool {
  name = "document";
  description =
    "Generate and save documents in various formats (txt, md, html, json, csv). " +
    'Input must be JSON: {"title": "...", "content": "...", "format": "md", "filename": "..."}. ' +
    "Supported formats: txt, md, html, json, csv.";

  private outputDir: string;
  private defaultFormat: DocumentFormat;

  constructor(config: DocumentToolConfig = {}) {
    super(config);
    this.outputDir = config.outputDir ?? "./documents";
    this.defaultFormat = config.defaultFormat ?? "md";
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-z0-9\-_\.]/gi, "_")
      .replace(/_+/g, "_")
      .toLowerCase()
      .slice(0, 100);
  }

  private generateHtml(title: string, content: string): string {
    const escapedContent = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="content">${escapedContent}</div>
</body>
</html>`;
  }

  private formatContent(
    format: DocumentFormat,
    title: string,
    content: string,
    metadata?: Record<string, unknown>
  ): string {
    switch (format) {
      case "md":
        return `# ${title}\n\n${content}${metadata ? `\n\n---\n\n*Generated: ${new Date().toISOString()}*` : ""}`;
      case "html":
        return this.generateHtml(title, content);
      case "json":
        return JSON.stringify(
          { title, content, metadata, generatedAt: new Date().toISOString() },
          null,
          2
        );
      case "csv":
        // Treat each line of content as a CSV row
        const rows = content.split("\n").map((line) => `"${line.replace(/"/g, '""')}"`);
        return `"title","content"\n${rows.map((r) => `"${title}",${r}`).join("\n")}`;
      case "txt":
      default:
        return `${title}\n${"=".repeat(title.length)}\n\n${content}`;
    }
  }

  async call(input: string): Promise<ToolResult> {
    let parsed: {
      title?: string;
      content?: string;
      format?: DocumentFormat;
      filename?: string;
      metadata?: Record<string, unknown>;
    };

    try {
      parsed = JSON.parse(input);
    } catch {
      // Try to treat the whole input as content with a default title
      parsed = {
        title: "Document",
        content: input,
        format: this.defaultFormat
      };
    }

    const title = parsed.title ?? "Untitled Document";
    const content = parsed.content ?? "";
    const format = parsed.format ?? this.defaultFormat;
    const filename =
      parsed.filename ??
      `${this.sanitizeFilename(title)}.${format}`;

    const fullPath = join(this.outputDir, filename);

    try {
      // Ensure output directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      const formattedContent = this.formatContent(format, title, content, parsed.metadata);

      await writeFile(fullPath, formattedContent, "utf8");

      return {
        output: `Document saved successfully: ${fullPath}\n\nFormat: ${format}\nTitle: ${title}\nSize: ${formattedContent.length} characters`,
        metadata: { path: fullPath, format, title, size: formattedContent.length }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: `Failed to create document: ${message}`,
        error: message
      };
    }
  }
}
