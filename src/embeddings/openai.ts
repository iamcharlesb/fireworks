import { BaseEmbeddings } from "./base";

export interface OpenAIEmbeddingsConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  timeout?: number;
  batchSize?: number;
  dimensions?: number;
}

/**
 * OpenAIEmbeddings — embed text using the OpenAI embeddings API.
 */
export class OpenAIEmbeddings extends BaseEmbeddings {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private organization?: string;
  private timeout: number;
  private batchSize: number;
  private dimensions?: number;

  constructor(config: OpenAIEmbeddingsConfig = {}) {
    super();
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = config.model ?? "text-embedding-3-small";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com";
    this.organization = config.organization;
    this.timeout = config.timeout ?? 60_000;
    this.batchSize = config.batchSize ?? 128;
    this.dimensions = config.dimensions;

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key is required. Pass apiKey in config or set OPENAI_API_KEY env var."
      );
    }
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchVectors = await this.createEmbeddings(batch);
      vectors.push(...batchVectors);
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.createEmbeddings([text]);
    return vectors[0] ?? [];
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`
    };
    if (this.organization) {
      headers["OpenAI-Organization"] = this.organization;
    }
    return headers;
  }

  private async createEmbeddings(input: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = {
      model: this.model,
      input,
      encoding_format: "float"
    };

    if (this.dimensions !== undefined) {
      body["dimensions"] = this.dimensions;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI embeddings error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
