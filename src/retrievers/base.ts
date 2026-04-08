import type { Document } from "../schema/types";

/**
 * BaseRetriever — abstract interface for retrieving documents relevant to a query.
 */
export abstract class BaseRetriever {
  /**
   * Return the documents most relevant to the input query.
   */
  abstract getRelevantDocuments(query: string): Promise<Document[]>;

  /**
   * LangChain-style alias for getRelevantDocuments().
   */
  async invoke(query: string): Promise<Document[]> {
    return this.getRelevantDocuments(query);
  }
}
