import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";

export interface BrowserToolConfig extends BaseToolConfig {
  timeout?: number;
  maxContentLength?: number;
  userAgent?: string;
}

/**
 * BrowserTool — fetches web pages and extracts text content.
 * Uses Node's built-in fetch API to retrieve web content.
 *
 * @example
 * const browser = new BrowserTool()
 * const result = await browser.run("https://www.example.com")
 * // Returns the text content of the page
 */
export class BrowserTool extends BaseTool {
  name = "browser";
  description =
    "Navigate to a URL and fetch its text content. " +
    "Input should be a valid URL (starting with http:// or https://). " +
    "Returns the page's text content, stripped of HTML tags.";

  private timeout: number;
  private maxContentLength: number;
  private userAgent: string;

  constructor(config: BrowserToolConfig = {}) {
    super(config);
    this.timeout = config.timeout ?? 30_000;
    this.maxContentLength = config.maxContentLength ?? 10_000;
    this.userAgent = config.userAgent ?? "Fireworks++/0.1.0 (browser-tool)";
  }

  /** Strip HTML tags and normalize whitespace */
  private extractText(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Check if input is a valid URL */
  private isValidUrl(input: string): boolean {
    try {
      const url = new URL(input);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  async call(input: string): Promise<ToolResult> {
    const url = input.trim();

    if (!this.isValidUrl(url)) {
      return {
        output: `Invalid URL: "${url}". Please provide a URL starting with http:// or https://`,
        error: "Invalid URL"
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept": "text/html,application/xhtml+xml,text/plain",
          "Accept-Language": "en-US,en;q=0.9"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          output: `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
          error: `HTTP ${response.status}`
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      let content: string;

      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        const html = await response.text();
        content = this.extractText(html);
      } else if (contentType.includes("text/")) {
        content = await response.text();
      } else if (contentType.includes("application/json")) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        return {
          output: `Cannot read content type: ${contentType}`,
          error: "Unsupported content type"
        };
      }

      // Truncate if too long
      if (content.length > this.maxContentLength) {
        content =
          content.slice(0, this.maxContentLength) +
          `\n\n[Content truncated — showing first ${this.maxContentLength} characters of ${content.length} total]`;
      }

      return {
        output: `Content from ${url}:\n\n${content}`,
        metadata: {
          url,
          status: response.status,
          contentType
        }
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("abort")) {
        return {
          output: `Request timed out after ${this.timeout}ms for: ${url}`,
          error: "Timeout"
        };
      }
      return {
        output: `Failed to fetch ${url}: ${message}`,
        error: message
      };
    }
  }
}
