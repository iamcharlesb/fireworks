import { VectorStore } from "./base";
import type { Document, SimilarityResult } from "../schema/types";
import type { BaseEmbeddings } from "../embeddings/base";
import { BaseEmbeddings as BaseEmbeddingsClass } from "../embeddings/base";

/**
 * InMemoryVectorStore — fast in-memory vector store using cosine similarity.
 * Suitable for development, testing, and small-to-medium datasets.
 *
 * @example
 * const store = await InMemoryVectorStore.fromTexts(
 *   ["hello world", "foo bar"],
 *   [{}, {}],
 *   new FakeEmbeddings()
 * )
 * const results = await store.similaritySearch("hello", 1)
 */
export class InMemoryVectorStore extends VectorStore {
  private _vectors: number[][] = [];
  private _documents: Document[] = [];

  constructor(embeddings: BaseEmbeddings) {
    super(embeddings);
  }

  /**
   * Embed and store documents.
   */
  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    await this.addVectors(vectors, documents);
  }

  /**
   * Store pre-computed vectors alongside documents.
   */
  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    if (vectors.length !== documents.length) {
      throw new Error(
        `Vectors length (${vectors.length}) must match documents length (${documents.length})`
      );
    }
    for (let i = 0; i < vectors.length; i++) {
      this._vectors.push(vectors[i]);
      this._documents.push(documents[i]);
    }
  }

  /**
   * Search for the k most similar documents to the query.
   * Optionally filter by metadata fields.
   */
  async similaritySearchWithScore(
    query: string,
    k: number,
    filter?: Record<string, unknown>
  ): Promise<SimilarityResult[]> {
    if (this._vectors.length === 0) return [];

    const queryVector = await this.embeddings.embedQuery(query);

    // Compute cosine similarity for all stored documents
    const scored: SimilarityResult[] = [];
    for (let i = 0; i < this._vectors.length; i++) {
      const doc = this._documents[i];

      // Apply metadata filter if provided
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const score = BaseEmbeddingsClass.cosineSimilarity(queryVector, this._vectors[i]);
      scored.push({ document: doc, score });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k);
  }

  /**
   * Number of stored documents.
   */
  get size(): number {
    return this._documents.length;
  }

  /**
   * Delete documents matching the given metadata filter.
   */
  async delete(filter: Record<string, unknown>): Promise<void> {
    const toKeep: number[] = [];

    for (let i = 0; i < this._documents.length; i++) {
      const doc = this._documents[i];
      let matches = true;
      for (const [key, value] of Object.entries(filter)) {
        if (doc.metadata[key] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        toKeep.push(i);
      }
    }

    this._documents = toKeep.map((i) => this._documents[i]);
    this._vectors = toKeep.map((i) => this._vectors[i]);
  }

  /**
   * Create an InMemoryVectorStore from Documents.
   */
  static async fromDocuments(
    docs: Document[],
    embeddings: BaseEmbeddings
  ): Promise<InMemoryVectorStore> {
    const store = new InMemoryVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
  }

  /**
   * Create an InMemoryVectorStore from raw texts and metadata.
   */
  static async fromTexts(
    texts: string[],
    metadatas: Record<string, unknown>[],
    embeddings: BaseEmbeddings
  ): Promise<InMemoryVectorStore> {
    const documents: Document[] = texts.map((text, i) => ({
      pageContent: text,
      metadata: metadatas[i] ?? {}
    }));
    return InMemoryVectorStore.fromDocuments(documents, embeddings);
  }
}
