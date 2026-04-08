import type { Document } from "../schema/types";
import { BaseRetriever } from "./base";
import type { VectorStore } from "../vectorstores/base";

export interface VectorStoreRetrieverConfig {
  k?: number;
  filter?: Record<string, unknown>;
  searchType?: "similarity" | "mmr";
  fetchK?: number;
  lambdaMult?: number;
}

/**
 * VectorStoreRetriever — adapts any VectorStore to the retriever interface.
 */
export class VectorStoreRetriever extends BaseRetriever {
  private k: number;
  private filter?: Record<string, unknown>;
  private searchType: "similarity" | "mmr";
  private fetchK: number;
  private lambdaMult: number;

  constructor(
    private vectorStore: VectorStore,
    config: VectorStoreRetrieverConfig = {}
  ) {
    super();
    this.k = config.k ?? 4;
    this.filter = config.filter;
    this.searchType = config.searchType ?? "similarity";
    this.fetchK = config.fetchK ?? 20;
    this.lambdaMult = config.lambdaMult ?? 0.5;
  }

  async getRelevantDocuments(query: string): Promise<Document[]> {
    if (this.searchType === "mmr") {
      return this.vectorStore.maxMarginalRelevanceSearch(
        query,
        this.k,
        this.fetchK,
        this.lambdaMult
      );
    }

    return this.vectorStore.similaritySearch(query, this.k, this.filter);
  }
}
