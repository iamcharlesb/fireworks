import type { Document, SimilarityResult } from "../schema/types";
import type { BaseEmbeddings } from "../embeddings/base";
import { BaseEmbeddings as BaseEmbeddingsClass } from "../embeddings/base";

/**
 * VectorStore abstract base class.
 * Provides similarity search over embedded documents.
 */
export abstract class VectorStore {
  constructor(protected embeddings: BaseEmbeddings) {}

  /**
   * Add documents to the store (embeds them internally).
   */
  abstract addDocuments(documents: Document[]): Promise<void>;

  /**
   * Add pre-computed vectors alongside documents.
   */
  abstract addVectors(vectors: number[][], documents: Document[]): Promise<void>;

  /**
   * Similarity search returning documents with scores.
   */
  abstract similaritySearchWithScore(
    query: string,
    k: number,
    filter?: Record<string, unknown>
  ): Promise<SimilarityResult[]>;

  /**
   * Similarity search returning only documents (without scores).
   */
  async similaritySearch(
    query: string,
    k: number = 4,
    filter?: Record<string, unknown>
  ): Promise<Document[]> {
    const results = await this.similaritySearchWithScore(query, k, filter);
    return results.map((r) => r.document);
  }

  /**
   * Maximal Marginal Relevance search — balances relevance vs. diversity.
   *
   * Fetches `fetchK` candidates by similarity, then greedily selects `k`
   * documents that maximize: lambda * relevance - (1 - lambda) * max_similarity_to_selected
   *
   * @param query     - The search query
   * @param k         - Number of documents to return
   * @param fetchK    - Candidate pool size (must be >= k)
   * @param lambdaMult - Trade-off: 1.0 = pure relevance, 0.0 = pure diversity
   */
  async maxMarginalRelevanceSearch(
    query: string,
    k: number = 4,
    fetchK: number = 20,
    lambdaMult: number = 0.5
  ): Promise<Document[]> {
    const candidates = await this.similaritySearchWithScore(query, fetchK);
    if (candidates.length === 0) return [];

    // Embed the query once so we can re-use the query vector
    const queryVector = await this.embeddings.embedQuery(query);

    // We need the embedding vectors of the candidates; re-embed their content
    const candidateTexts = candidates.map((c) => c.document.pageContent);
    const candidateVectors = await this.embeddings.embedDocuments(candidateTexts);

    const selected: number[] = [];
    const remaining = candidates.map((_, i) => i);

    // Bootstrap: pick the most relevant document first
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (const idx of remaining) {
      const sim = BaseEmbeddingsClass.cosineSimilarity(queryVector, candidateVectors[idx]);
      if (sim > bestScore) {
        bestScore = sim;
        bestIdx = idx;
      }
    }
    selected.push(bestIdx);
    remaining.splice(remaining.indexOf(bestIdx), 1);

    // Greedily add documents
    while (selected.length < k && remaining.length > 0) {
      let bestCandidate = remaining[0];
      let bestMMRScore = -Infinity;

      for (const idx of remaining) {
        const relevance = BaseEmbeddingsClass.cosineSimilarity(queryVector, candidateVectors[idx]);

        // Maximum similarity to already-selected documents
        let maxSimilarityToSelected = -Infinity;
        for (const selIdx of selected) {
          const sim = BaseEmbeddingsClass.cosineSimilarity(
            candidateVectors[idx],
            candidateVectors[selIdx]
          );
          if (sim > maxSimilarityToSelected) {
            maxSimilarityToSelected = sim;
          }
        }

        const mmrScore =
          lambdaMult * relevance - (1 - lambdaMult) * maxSimilarityToSelected;

        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore;
          bestCandidate = idx;
        }
      }

      selected.push(bestCandidate);
      remaining.splice(remaining.indexOf(bestCandidate), 1);
    }

    return selected.map((i) => candidates[i].document);
  }

  /**
   * Static factory — create a VectorStore from Documents.
   * Must be overridden by concrete implementations.
   */
  static async fromDocuments(
    _documents: Document[],
    _embeddings: BaseEmbeddings
  ): Promise<VectorStore> {
    throw new Error("fromDocuments must be implemented by a concrete VectorStore subclass");
  }

  /**
   * Static factory — create a VectorStore from raw texts and metadata.
   * Must be overridden by concrete implementations.
   */
  static async fromTexts(
    _texts: string[],
    _metadatas: Record<string, unknown>[],
    _embeddings: BaseEmbeddings
  ): Promise<VectorStore> {
    throw new Error("fromTexts must be implemented by a concrete VectorStore subclass");
  }
}
