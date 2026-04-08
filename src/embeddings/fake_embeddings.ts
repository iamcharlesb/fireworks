import { BaseEmbeddings } from "./base";

/**
 * FakeEmbeddings — deterministic embeddings for testing (no API needed).
 * Uses character frequency analysis to produce pseudo-embeddings.
 * Vectors are normalized to unit length.
 *
 * @example
 * const embeddings = new FakeEmbeddings(64)
 * const vector = await embeddings.embedQuery("hello world")
 * // Returns a 64-dimensional unit vector deterministically derived from "hello world"
 */
export class FakeEmbeddings extends BaseEmbeddings {
  private dimensions: number;

  constructor(dimensions: number = 128) {
    super();
    this.dimensions = dimensions;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.textToVector(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.textToVector(text);
  }

  /**
   * Generate a deterministic embedding from text using character frequencies
   * and a simple hash spread across the dimensions. Normalized to unit length.
   */
  private textToVector(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);

    if (text.length === 0) {
      return vector;
    }

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      // Spread character signal across dimensions using modular arithmetic
      // and a secondary position-sensitive component
      const primary = charCode % this.dimensions;
      const secondary = (charCode * 31 + i) % this.dimensions;
      const tertiary = (charCode * 37 + i * 7) % this.dimensions;

      vector[primary] += 1;
      vector[secondary] += 0.5;
      vector[tertiary] += 0.25;
    }

    // Add a length-based bias to the first dimension so different-length texts
    // of similar characters aren't identical
    vector[0] += Math.log1p(text.length) * 0.1;

    return BaseEmbeddings.normalize(vector);
  }
}
