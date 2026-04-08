import type { Document } from "../schema/types";

export interface TextSplitterOptions {
  /** Maximum size of each chunk (measured by lengthFunction). Default: 1000. */
  chunkSize?: number;
  /** Number of characters to overlap between consecutive chunks. Default: 200. */
  chunkOverlap?: number;
  /** Function to measure chunk length. Default: (s) => s.length. */
  lengthFunction?: (text: string) => number;
  /** Whether to keep the separator in the output chunks. Default: false. */
  keepSeparator?: boolean;
}

/**
 * BaseTextSplitter — abstract base for all text splitting strategies.
 */
export abstract class BaseTextSplitter {
  protected chunkSize: number;
  protected chunkOverlap: number;
  protected lengthFunction: (text: string) => number;
  protected keepSeparator: boolean;

  constructor(options: TextSplitterOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.lengthFunction = options.lengthFunction ?? ((s: string) => s.length);
    this.keepSeparator = options.keepSeparator ?? false;

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error(
        `chunkOverlap (${this.chunkOverlap}) must be less than chunkSize (${this.chunkSize})`
      );
    }
  }

  /**
   * Split raw text into an array of chunk strings.
   */
  abstract splitText(text: string): Promise<string[]>;

  /**
   * Create Documents from an array of texts and optional metadata.
   */
  async createDocuments(
    texts: string[],
    metadatas?: Record<string, unknown>[]
  ): Promise<Document[]> {
    const documents: Document[] = [];

    for (let i = 0; i < texts.length; i++) {
      const chunks = await this.splitText(texts[i]);
      const baseMeta = metadatas?.[i] ?? {};

      for (let j = 0; j < chunks.length; j++) {
        documents.push({
          pageContent: chunks[j],
          metadata: {
            ...baseMeta,
            chunkIndex: j,
            chunkCount: chunks.length
          }
        });
      }
    }

    return documents;
  }

  /**
   * Split an array of Documents, preserving and augmenting their metadata.
   */
  async splitDocuments(documents: Document[]): Promise<Document[]> {
    const results: Document[] = [];

    for (const doc of documents) {
      const chunks = await this.splitText(doc.pageContent);

      for (let i = 0; i < chunks.length; i++) {
        results.push({
          pageContent: chunks[i],
          metadata: {
            ...doc.metadata,
            chunkIndex: i,
            chunkCount: chunks.length
          },
          id: doc.id
        });
      }
    }

    return results;
  }

  /**
   * Merge an array of small splits into chunks that respect chunkSize and chunkOverlap.
   *
   * Algorithm:
   * 1. Accumulate splits into a current window until adding the next split would exceed chunkSize.
   * 2. When the window is full, emit it as a chunk.
   * 3. Slide the window forward by removing leading splits until total <= chunkOverlap.
   */
  protected mergeSplits(splits: string[], separator: string): string[] {
    const chunks: string[] = [];
    const currentSplits: string[] = [];
    let currentLength = 0;
    const sepLen = this.lengthFunction(separator);

    for (const split of splits) {
      const splitLen = this.lengthFunction(split);

      // Calculate the extra length needed to add this split (include separator if not first)
      const addedLen = currentSplits.length > 0 ? sepLen + splitLen : splitLen;

      if (currentLength + addedLen > this.chunkSize && currentSplits.length > 0) {
        // Emit current window as a chunk
        const chunk = currentSplits.join(separator);
        if (this.lengthFunction(chunk) > 0) {
          chunks.push(chunk);
        }

        // Slide window: remove leading splits until total <= chunkOverlap
        while (
          currentSplits.length > 0 &&
          (currentLength > this.chunkOverlap ||
            (currentLength + addedLen > this.chunkSize && currentLength > 0))
        ) {
          const removed = currentSplits.shift()!;
          const removedLen = this.lengthFunction(removed);
          currentLength -= removedLen + (currentSplits.length > 0 ? sepLen : 0);
          if (currentLength < 0) currentLength = 0;
        }
      }

      currentSplits.push(split);
      currentLength =
        currentSplits.length === 1
          ? splitLen
          : currentLength + sepLen + splitLen;
    }

    // Emit any remaining content
    if (currentSplits.length > 0) {
      const chunk = currentSplits.join(separator);
      if (this.lengthFunction(chunk) > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }
}
