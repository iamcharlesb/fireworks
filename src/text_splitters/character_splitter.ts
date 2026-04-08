import { BaseTextSplitter } from "./base";
import type { TextSplitterOptions } from "./base";

/**
 * CharacterTextSplitter — split text by a single separator character (or string).
 *
 * Splits the text on the separator, then merges the resulting pieces back
 * into chunks that respect chunkSize and chunkOverlap.
 *
 * @example
 * const splitter = new CharacterTextSplitter({ separator: "\n\n", chunkSize: 500 })
 * const chunks = await splitter.splitText(longText)
 */
export class CharacterTextSplitter extends BaseTextSplitter {
  private separator: string;

  constructor(options: TextSplitterOptions & { separator?: string } = {}) {
    super(options);
    this.separator = options.separator ?? "\n\n";
  }

  async splitText(text: string): Promise<string[]> {
    // Split on the separator
    let splits: string[];

    if (this.separator === "") {
      // Split into individual characters
      splits = text.split("");
    } else {
      splits = text.split(this.separator);
    }

    // Optionally re-attach the separator to splits
    if (this.keepSeparator && this.separator !== "") {
      splits = splits.map((s, i) => (i < splits.length - 1 ? s + this.separator : s));
    }

    // Filter out empty splits
    const nonEmpty = splits.filter((s) => s.length > 0);

    // Merge small splits into chunks respecting chunkSize / chunkOverlap
    const mergedSeparator = this.keepSeparator ? "" : this.separator;
    return this.mergeSplits(nonEmpty, mergedSeparator);
  }
}
