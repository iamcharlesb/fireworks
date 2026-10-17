import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

function escapeXmlText(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeModelSvg(svg: string) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
}

function tryExtractRawSvg(body: string): string | null {
  const t = body.trim();
  if (/^<\?xml\s/i.test(t)) {
    const start = t.indexOf("<svg");
    if (start >= 0) {
      const fragment = t.slice(start);
      const end = fragment.indexOf("</svg>");
      if (end > 0) {
        return sanitizeModelSvg(fragment.slice(0, end + 6));
      }
    }
  }
  if (t.startsWith("<svg")) {
    const end = t.indexOf("</svg>");
    return end > 0 ? sanitizeModelSvg(t.slice(0, end + 6)) : sanitizeModelSvg(t);
  }
  const idx = body.indexOf("<svg");
  if (idx >= 0 && idx < 8000) {
    const slice = body.slice(idx);
    const end = slice.indexOf("</svg>");
    if (end > 0) {
      return sanitizeModelSvg(slice.slice(0, end + 6));
    }
  }
  return null;
}

function parseFlowEdges(content: string): { from: string; to: string }[] | null {
  const edges: { from: string; to: string }[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) {
      continue;
    }
    const match = line.match(/^(.+?)\s*(?:→|->|-->|—>)\s*(.+)$/);
    if (match) {
      edges.push({ from: match[1].trim(), to: match[2].trim() });
    }
  }
  return edges.length > 0 ? edges : null;
}

function orderNodesFromEdges(edges: { from: string; to: string }[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!seen.has(edge.from)) {
      seen.add(edge.from);
      ordered.push(edge.from);
    }
    if (!seen.has(edge.to)) {
      seen.add(edge.to);
      ordered.push(edge.to);
    }
  }
  return ordered;
}

function buildFlowchartSvg(title: string, edges: { from: string; to: string }[]): string {
  const nodes = orderNodesFromEdges(edges);
  const nodeW = 148;
  const nodeH = 52;
  const gap = 36;
  const pad = 36;
  const headerY = 42;
  const startY = 96;
  const width = Math.max(720, pad * 2 + nodes.length * (nodeW + gap) - gap);
  const height = Math.max(260, startY + nodeH + pad);
  const defs = `<defs>
    <marker id="fw-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
      <polygon points="0 0, 10 4, 0 8" fill="#334155"/>
    </marker>
  </defs>`;
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXmlText(title)}">`,
    `<rect width="100%" height="100%" fill="#f8fafc"/>`,
    defs,
    `<text x="${pad}" y="${headerY}" fill="#0f172a" font-family="system-ui,sans-serif" font-size="22" font-weight="700">${escapeXmlText(title)}</text>`
  ];
  nodes.forEach((label, index) => {
    const x = pad + index * (nodeW + gap);
    const y = startY;
    const short = label.length > 22 ? `${label.slice(0, 20)}…` : label;
    parts.push(
      `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="10" fill="#e2e8f0" stroke="#64748b" stroke-width="1.5"/>`
    );
    parts.push(
      `<text x="${x + nodeW / 2}" y="${y + nodeH / 2 + 5}" text-anchor="middle" fill="#1e293b" font-family="system-ui,sans-serif" font-size="13">${escapeXmlText(short)}</text>`
    );
  });
  const cy = startY + nodeH / 2;
  for (const edge of edges) {
    const fi = nodes.indexOf(edge.from);
    const ti = nodes.indexOf(edge.to);
    if (fi < 0 || ti < 0) {
      continue;
    }
    const x1 = pad + fi * (nodeW + gap) + nodeW;
    const x2 = pad + ti * (nodeW + gap);
    parts.push(
      `<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}" stroke="#334155" stroke-width="2.2" marker-end="url(#fw-arrow)"/>`
    );
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

function wrapTextForPdf(text: string, width = 90): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) {
        lines.push(current);
      }
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function splitPresentationChunks(content: string): string[] {
  const trimmed = content.trim();
  const dashed = trimmed
    .split(/\n-{3,}\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (dashed.length > 1) {
    return dashed.slice(0, 24);
  }
  const h2Parts = trimmed.split(/^##\s+/m).map((chunk) => chunk.trim()).filter(Boolean);
  if (h2Parts.length > 1) {
    return h2Parts.slice(0, 24);
  }
  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs.slice(0, 14);
  }
  return [trimmed.slice(0, 4500)];
}

export type DocumentFormat = "txt" | "md" | "html" | "json" | "csv" | "svg" | "docx" | "pptx" | "pdf";

export interface DocumentToolConfig extends BaseToolConfig {
  outputDir?: string;
  defaultFormat?: DocumentFormat;
}

/**
 * DocumentTool — generate documents in various formats (including PDF via pdf-lib).
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
    "Generate and save documents in various formats (txt, md, html, json, csv, svg, docx, pptx, pdf). " +
    'Input must be JSON: {"title": "...", "content": "...", "format": "md", "filename": "..."}. ' +
    "SVG: content may be raw <svg>...</svg>, flowchart lines (A -> B), or plain text. " +
    "PDF: creates a new multi-page PDF from text content. " +
    "Supported formats: txt, md, html, json, csv, svg, docx, pptx, pdf.";

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

  private generateSvg(title: string, content: string): string {
    const embedded = tryExtractRawSvg(content);
    if (embedded) {
      return embedded;
    }
    const edges = parseFlowEdges(content);
    if (edges) {
      return buildFlowchartSvg(title, edges);
    }
    const escapedTitle = escapeXmlText(title);
    const escapedLines = content.split("\n").slice(0, 22).map((line) => escapeXmlText(line));
    const height = Math.max(260, 130 + escapedLines.length * 24);
    const tspans = escapedLines
      .map((line, index) => `<tspan x="40" dy="${index === 0 ? 0 : 24}">${line || " "}</tspan>`)
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-label="${escapedTitle}">
  <rect width="1200" height="${height}" fill="#0b1020" />
  <rect x="20" y="20" width="1160" height="${height - 40}" rx="16" fill="#121a31" stroke="#2b3d71" />
  <text x="40" y="70" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">${escapedTitle}</text>
  <text x="40" y="120" fill="#bfdbfe" font-family="Inter, Arial, sans-serif" font-size="22">${tspans}</text>
</svg>`;
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
      case "svg":
        return this.generateSvg(title, content);
      case "txt":
      default:
        return `${title}\n${"=".repeat(title.length)}\n\n${content}`;
    }
  }

  private async writeDocx(fullPath: string, title: string, content: string) {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun(title)]
            }),
            ...content.split("\n\n").map(
              (block) =>
                new Paragraph({
                  children: [new TextRun(block)]
                })
            )
          ]
        }
      ]
    });
    await writeFile(fullPath, await Packer.toBuffer(doc));
  }

  private async writePptx(fullPath: string, title: string, content: string) {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "Fireworks++";
    pptx.subject = title;
    pptx.title = title;

    const chunks = splitPresentationChunks(content);
    chunks.forEach((chunk, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: "0F172A" };
      const slideTitle = index === 0 ? title : chunk.split("\n")[0]?.slice(0, 120) || `${title} (${index + 1})`;
      const slideBody = index === 0 ? chunk : chunk.split("\n").slice(1).join("\n").trim() || chunk;

      slide.addText(slideTitle, {
        x: 0.5,
        y: 0.35,
        w: 12.2,
        h: 0.85,
        bold: true,
        color: "E2E8F0",
        fontSize: index === 0 ? 30 : 26
      });
      slide.addText(slideBody.slice(0, 3200), {
        x: 0.65,
        y: 1.25,
        w: 11.9,
        h: 5.1,
        color: "CBD5E1",
        fontSize: 16,
        valign: "top"
      });
    });

    await pptx.writeFile({ fileName: fullPath });
  }

  private async writePdf(fullPath: string, title: string, content: string) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    let page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let y = 752;

    page.drawText(title, {
      x: 48,
      y,
      size: 20,
      font,
      color: rgb(0.1, 0.15, 0.2)
    });
    y -= 34;

    for (const paragraph of content.split("\n")) {
      const lines = wrapTextForPdf(paragraph || " ");
      for (const line of lines) {
        if (y < 56) {
          page = pdf.addPage([612, 792]);
          y = 752;
        }
        page.drawText(line, {
          x: 48,
          y,
          size: 11,
          font,
          color: rgb(0.2, 0.22, 0.26)
        });
        y -= 16;
      }
      y -= 8;
    }

    await writeFile(fullPath, await pdf.save());
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
    const filename = parsed.filename ?? `${this.sanitizeFilename(title)}.${format}`;

    const fullPath = join(this.outputDir, filename);

    try {
      // Ensure output directory exists
      await mkdir(dirname(fullPath), { recursive: true });

      if (format === "docx") {
        await this.writeDocx(fullPath, title, content);
      } else if (format === "pptx") {
        await this.writePptx(fullPath, title, content);
      } else if (format === "pdf") {
        await this.writePdf(fullPath, title, content);
      } else {
        const formattedContent = this.formatContent(format, title, content, parsed.metadata);
        await writeFile(fullPath, formattedContent, "utf8");
      }

      const size = Buffer.byteLength(content, "utf8");

      return {
        output: `Document saved successfully: ${fullPath}\n\nFormat: ${format}\nTitle: ${title}`,
        metadata: { path: fullPath, format, title, size }
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
