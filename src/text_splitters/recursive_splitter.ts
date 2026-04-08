import { BaseTextSplitter } from "./base";
import type { TextSplitterOptions } from "./base";

/**
 * RecursiveCharacterTextSplitter — the most commonly used text splitter.
 *
 * Tries each separator in order. If the resulting chunks are still larger than
 * chunkSize, it recursively splits them using the next separator in the list.
 * This ensures a best-effort attempt to keep semantically related text together.
 *
 * Default separators: ["\n\n", "\n", " ", ""]
 *
 * @example
 * const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 })
 * const chunks = await splitter.splitText(longDocument)
 */
export class RecursiveCharacterTextSplitter extends BaseTextSplitter {
  private separators: string[];

  constructor(
    options: TextSplitterOptions & { separators?: string[] } = {}
  ) {
    super(options);
    this.separators = options.separators ?? ["\n\n", "\n", " ", ""];
  }

  async splitText(text: string): Promise<string[]> {
    return this._splitText(text, this.separators);
  }

  /**
   * Recursively split text using the provided separator list.
   */
  private _splitText(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];

    // Find the first separator that is present in the text
    let separator = separators[separators.length - 1];
    let newSeparators: string[] = [];

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i];
      if (s === "") {
        separator = s;
        break;
      }
      if (text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    // Split by the chosen separator
    let splits: string[];
    if (separator === "") {
      splits = text.split("");
    } else {
      splits = text.split(separator);
    }

    // Filter empty strings
    const nonEmpty = splits.filter((s) => s.length > 0);

    // For each split: if it's small enough, accumulate it; otherwise recurse
    const goodSplits: string[] = [];

    for (const split of nonEmpty) {
      if (this.lengthFunction(split) <= this.chunkSize) {
        goodSplits.push(split);
      } else {
        // First, flush accumulated good splits as merged chunks
        if (goodSplits.length > 0) {
          const merged = this.mergeSplits(goodSplits, separator);
          finalChunks.push(...merged);
          goodSplits.length = 0;
        }

        // Recurse if we have more separators to try
        if (newSeparators.length === 0) {
          // No more separators — forced split at chunkSize
          finalChunks.push(...this.forceSplit(split));
        } else {
          const subChunks = this._splitText(split, newSeparators);
          finalChunks.push(...subChunks);
        }
      }
    }

    // Flush any remaining good splits
    if (goodSplits.length > 0) {
      const merged = this.mergeSplits(goodSplits, separator);
      finalChunks.push(...merged);
    }

    return finalChunks;
  }

  /**
   * Force-split a text that has no useful separators by slicing at chunkSize
   * with chunkOverlap.
   */
  private forceSplit(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start += this.chunkSize - this.chunkOverlap;
    }

    return chunks;
  }

  /**
   * Create a splitter pre-configured for a specific programming language.
   */
  static fromLanguage(
    language: "markdown" | "python" | "js" | "ts"
  ): RecursiveCharacterTextSplitter {
    const separatorMap: Record<string, string[]> = {
      markdown: [
        "\n## ",
        "\n### ",
        "\n#### ",
        "\n##### ",
        "\n###### ",
        "\n---\n",
        "\n___\n",
        "\n\n",
        "\n",
        " ",
        ""
      ],
      python: [
        "\nclass ",
        "\ndef ",
        "\n\tdef ",
        "\n\n",
        "\n",
        " ",
        ""
      ],
      js: [
        "\nfunction ",
        "\nconst ",
        "\nlet ",
        "\nvar ",
        "\nclass ",
        "\n\n",
        "\n",
        " ",
        ""
      ],
      ts: [
        "\nfunction ",
        "\nexport function ",
        "\nexport const ",
        "\nconst ",
        "\nlet ",
        "\nvar ",
        "\nclass ",
        "\nexport class ",
        "\ninterface ",
        "\nexport interface ",
        "\ntype ",
        "\nexport type ",
        "\n\n",
        "\n",
        " ",
        ""
      ]
    };

    return new RecursiveCharacterTextSplitter({
      separators: separatorMap[language]
    });
  }
}
