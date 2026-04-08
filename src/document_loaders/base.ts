import type { Document } from "../schema/types";
import type { BaseTextSplitter as TextSplitter } from "../text_splitters/base";

/**
 * BaseDocumentLoader — abstract base for all document loading implementations.
 */
export abstract class BaseDocumentLoader {
  /**
   * Load all documents from the source.
   */
  abstract load(): Promise<Document[]>;

  /**
   * Load documents, then split them using the provided splitter.
   * If no splitter is provided, returns documents as-is.
   */
  async loadAndSplit(splitter?: TextSplitter): Promise<Document[]> {
    const docs = await this.load();
    if (!splitter) return docs;
    return splitter.splitDocuments(docs);
  }

  /**
   * Lazy load documents one at a time using an async generator.
   * Default implementation loads all and yields them sequentially.
   * Subclasses can override for true streaming behavior.
   */
  async *lazyLoad(): AsyncGenerator<Document> {
    const docs = await this.load();
    for (const doc of docs) {
      yield doc;
    }
  }
}
