import { BaseTool, type BaseToolConfig } from "./base";
import type { ToolResult } from "../schema/types";

export interface ResearchToolConfig extends BaseToolConfig {
  maxResults?: number;
  language?: string;
}

/**
 * ResearchTool — fetches information from Wikipedia and web sources.
 * Uses the Wikipedia REST API for factual lookups.
 *
 * @example
 * const research = new ResearchTool({ maxResults: 3 })
 * const result = await research.run("Eiffel Tower history")
 */
export class ResearchTool extends BaseTool {
  name = "research";
  description =
    "Research topics using Wikipedia and web knowledge sources. " +
    "Input should be a search query or topic to research. " +
    "Returns a summary with key facts.";

  private maxResults: number;
  private language: string;

  constructor(config: ResearchToolConfig = {}) {
    super(config);
    this.maxResults = config.maxResults ?? 3;
    this.language = config.language ?? "en";
  }

  async call(input: string): Promise<ToolResult> {
    const query = input.trim();
    if (!query) {
      return { output: "Error: empty research query", error: "Empty query" };
    }

    try {
      // Wikipedia search API
      const searchUrl = new URL(
        `https://${this.language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
      );

      const response = await fetch(searchUrl.toString(), {
        headers: { "User-Agent": "Fireworks++/0.1.0 (research-tool)" }
      });

      if (response.ok) {
        const data = (await response.json()) as {
          title?: string;
          extract?: string;
          description?: string;
          content_urls?: { desktop?: { page?: string } };
        };

        if (data.extract) {
          const summary = [
            `**${data.title ?? query}**`,
            data.description ? `*${data.description}*` : "",
            "",
            data.extract,
            "",
            data.content_urls?.desktop?.page
              ? `Source: ${data.content_urls.desktop.page}`
              : ""
          ]
            .filter(Boolean)
            .join("\n");

          return { output: summary, metadata: { source: "wikipedia", title: data.title } };
        }
      }

      // Fallback: Wikipedia opensearch
      const searchFallback = await fetch(
        `https://${this.language}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${this.maxResults}&format=json&origin=*`,
        {
          headers: { "User-Agent": "Fireworks++/0.1.0" }
        }
      );

      if (searchFallback.ok) {
        const [, titles, , urls] = (await searchFallback.json()) as [string, string[], string[], string[]];

        if (titles.length === 0) {
          return {
            output: `No results found for: "${query}". Try a more specific search term.`,
            metadata: { source: "wikipedia", query }
          };
        }

        const results = titles
          .slice(0, this.maxResults)
          .map((title, i) => `${i + 1}. **${title}** - ${urls[i] ?? ""}`)
          .join("\n");

        return {
          output: `Search results for "${query}":\n\n${results}`,
          metadata: { source: "wikipedia", query, resultCount: titles.length }
        };
      }

      return {
        output: `Could not retrieve research results for: "${query}"`,
        error: "Wikipedia API unavailable"
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output: `Research failed: ${message}`,
        error: message
      };
    }
  }
}
