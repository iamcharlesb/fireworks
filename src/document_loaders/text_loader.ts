import * as fs from "fs/promises";
import * as path from "path";
import { BaseDocumentLoader } from "./base";
import type { Document } from "../schema/types";

/**
 * TextLoader — load a plain text file from disk as a single Document.
 *
 * @example
 * const loader = new TextLoader("/path/to/file.txt")
 * const docs = await loader.load()
 * // docs[0].pageContent = file contents
 * // docs[0].metadata = { source, fileName, size, extension }
 */
export class TextLoader extends BaseDocumentLoader {
  constructor(
    private filePath: string,
    private encoding: BufferEncoding = "utf-8"
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const absolutePath = path.resolve(this.filePath);
    const content = await fs.readFile(absolutePath, { encoding: this.encoding });
    const stats = await fs.stat(absolutePath);

    const document: Document = {
      pageContent: content,
      metadata: {
        source: absolutePath,
        fileName: path.basename(absolutePath),
        size: stats.size,
        extension: path.extname(absolutePath).toLowerCase()
      }
    };

    return [document];
  }
}
