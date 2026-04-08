/**
 * BaseEmbeddings — abstract class for text embedding providers.
 */
export abstract class BaseEmbeddings {
  /**
   * Embed multiple documents (batch).
   */
  abstract embedDocuments(texts: string[]): Promise<number[][]>;

  /**
   * Embed a single query string.
   */
  abstract embedQuery(text: string): Promise<number[]>;

  /**
   * Cosine similarity between two vectors.
   * Returns a value in [-1, 1] where 1 = identical direction.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    const dot = BaseEmbeddings.dotProduct(a, b);
    const magA = Math.sqrt(BaseEmbeddings.dotProduct(a, a));
    const magB = Math.sqrt(BaseEmbeddings.dotProduct(b, b));
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
  }

  /**
   * Dot product of two vectors.
   */
  static dotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Normalize a vector to unit length (L2 norm).
   */
  static normalize(v: number[]): number[] {
    const mag = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    if (mag === 0) return v.map(() => 0);
    return v.map((x) => x / mag);
  }
}
