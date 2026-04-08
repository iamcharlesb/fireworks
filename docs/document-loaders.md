# Document Loaders and Text Splitters

Document loaders read files from disk (or other sources) and return `Document` objects. Text splitters break large documents into smaller chunks suitable for embedding and retrieval.

## Document Shape

```typescript
interface Document {
  pageContent: string              // The text content
  metadata: Record<string, unknown> // Source, filename, page number, etc.
  id?: string
}
```

---

## BaseDocumentLoader

All document loaders extend `BaseDocumentLoader`:

```typescript
abstract class BaseDocumentLoader {
  // Load all documents from the source
  abstract load(): Promise<Document[]>

  // Load and split in one step
  loadAndSplit(splitter?: BaseTextSplitter): Promise<Document[]>

  // Lazy async generator — load one document at a time
  lazyLoad(): AsyncGenerator<Document>
}
```

---

## TextLoader

Loads a plain text file from disk as a single `Document`. Metadata includes the file path, name, size, and extension.

```typescript
import { TextLoader } from 'fireworks-plus-plus'

const loader = new TextLoader('./data/readme.txt')
const docs = await loader.load()

console.log(docs.length)              // 1
console.log(docs[0].pageContent)      // Full file contents
console.log(docs[0].metadata)
// {
//   source: '/absolute/path/data/readme.txt',
//   fileName: 'readme.txt',
//   size: 4096,
//   extension: '.txt'
// }
```

### Config

```typescript
new TextLoader(
  filePath: string,
  encoding: BufferEncoding = 'utf-8'
)
```

### Loading Multiple Files

```typescript
import { TextLoader } from 'fireworks-plus-plus'

const files = ['./docs/faq.txt', './docs/guide.txt', './docs/changelog.txt']

const allDocs = []
for (const file of files) {
  const loader = new TextLoader(file)
  const docs = await loader.load()
  allDocs.push(...docs)
}

console.log(`Loaded ${allDocs.length} documents`)
allDocs.forEach(d => console.log(d.metadata['fileName']))
```

### Lazy Loading

For large files or many files, use `lazyLoad()` to process one document at a time:

```typescript
const loader = new TextLoader('./large-corpus.txt')
for await (const doc of loader.lazyLoad()) {
  // Process each document without loading all into memory
  await processDocument(doc)
}
```

---

## Building Custom Document Loaders

Extend `BaseDocumentLoader` to load from any source — databases, APIs, cloud storage, etc.

```typescript
import { BaseDocumentLoader } from 'fireworks-plus-plus'
import type { Document } from 'fireworks-plus-plus'

export class JsonFileLoader extends BaseDocumentLoader {
  constructor(private filePath: string, private textField: string) {
    super()
  }

  async load(): Promise<Document[]> {
    const { readFile } = await import('fs/promises')
    const { resolve, basename } = await import('path')

    const absolutePath = resolve(this.filePath)
    const rawText = await readFile(absolutePath, 'utf-8')
    const data = JSON.parse(rawText) as unknown[]

    if (!Array.isArray(data)) {
      return [{
        pageContent: String(data),
        metadata: { source: absolutePath }
      }]
    }

    return data.map((item, index) => ({
      pageContent: String((item as Record<string, unknown>)[this.textField] ?? JSON.stringify(item)),
      metadata: {
        source: absolutePath,
        fileName: basename(absolutePath),
        index
      }
    }))
  }
}

// Usage
const loader = new JsonFileLoader('./articles.json', 'body')
const docs = await loader.load()
```

### API Loader Example

```typescript
import { BaseDocumentLoader } from 'fireworks-plus-plus'
import type { Document } from 'fireworks-plus-plus'

interface NewsArticle {
  title: string
  content: string
  publishedAt: string
  url: string
}

export class NewsApiLoader extends BaseDocumentLoader {
  constructor(
    private apiKey: string,
    private query: string,
    private pageSize = 10
  ) {
    super()
  }

  async load(): Promise<Document[]> {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(this.query)}&pageSize=${this.pageSize}&apiKey=${this.apiKey}`
    const response = await fetch(url)
    const data = await response.json() as { articles: NewsArticle[] }

    return data.articles.map(article => ({
      pageContent: `${article.title}\n\n${article.content}`,
      metadata: {
        source: article.url,
        publishedAt: article.publishedAt,
        title: article.title
      }
    }))
  }
}
```

---

## Text Splitters

The `text_splitters` module is a stub — the `BaseTextSplitter` interface is defined but concrete splitter implementations follow the same pattern. You can implement your own:

```typescript
export abstract class BaseTextSplitter {
  abstract splitText(text: string): Promise<string[]>

  async splitDocuments(documents: Document[]): Promise<Document[]> {
    const results: Document[] = []
    for (const doc of documents) {
      const chunks = await this.splitText(doc.pageContent)
      for (let i = 0; i < chunks.length; i++) {
        results.push({
          pageContent: chunks[i],
          metadata: { ...doc.metadata, chunkIndex: i, totalChunks: chunks.length }
        })
      }
    }
    return results
  }
}
```

### CharacterTextSplitter (Custom Implementation)

```typescript
import type { Document } from 'fireworks-plus-plus'

export class CharacterTextSplitter {
  constructor(
    private chunkSize = 1000,
    private chunkOverlap = 200,
    private separator = '\n\n'
  ) {}

  splitText(text: string): string[] {
    const chunks: string[] = []
    const splits = text.split(this.separator)
    let currentChunk = ''

    for (const split of splits) {
      const separator = currentChunk ? this.separator : ''
      if ((currentChunk + separator + split).length <= this.chunkSize) {
        currentChunk += separator + split
      } else {
        if (currentChunk) chunks.push(currentChunk.trim())
        currentChunk = split
      }
    }

    if (currentChunk.trim()) chunks.push(currentChunk.trim())

    // Apply overlap
    if (this.chunkOverlap > 0 && chunks.length > 1) {
      return this.applyOverlap(chunks)
    }
    return chunks
  }

  private applyOverlap(chunks: string[]): string[] {
    const overlapped: string[] = [chunks[0]]
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]
      const overlap = prev.slice(-this.chunkOverlap)
      overlapped.push(overlap + '\n' + chunks[i])
    }
    return overlapped
  }

  async splitDocuments(documents: Document[]): Promise<Document[]> {
    const results: Document[] = []
    for (const doc of documents) {
      const chunks = this.splitText(doc.pageContent)
      chunks.forEach((chunk, i) => {
        results.push({
          pageContent: chunk,
          metadata: { ...doc.metadata, chunkIndex: i, totalChunks: chunks.length }
        })
      })
    }
    return results
  }
}
```

### RecursiveCharacterTextSplitter (Custom Implementation)

Splits on progressively smaller separators until chunks are below the size limit:

```typescript
export class RecursiveCharacterTextSplitter {
  private separators: string[]

  constructor(
    private chunkSize = 1000,
    private chunkOverlap = 200
  ) {
    this.separators = ['\n\n', '\n', '. ', ' ', '']
  }

  private splitWithSeparator(text: string, separator: string): string[] {
    if (separator === '') {
      return text.split('').reduce((acc, char) => {
        const last = acc[acc.length - 1] ?? ''
        if (last.length < this.chunkSize) {
          acc[acc.length - 1] = last + char
        } else {
          acc.push(char)
        }
        return acc
      }, [''])
    }
    return text.split(separator)
  }

  splitText(text: string, separators = this.separators): string[] {
    const [separator, ...remainingSeparators] = separators
    const splits = this.splitWithSeparator(text, separator ?? '')

    const chunks: string[] = []
    let current = ''

    for (const split of splits) {
      const candidate = current ? current + (separator ?? '') + split : split
      if (candidate.length <= this.chunkSize) {
        current = candidate
      } else {
        if (current) chunks.push(current.trim())
        if (split.length > this.chunkSize && remainingSeparators.length > 0) {
          // Recurse with next separator
          chunks.push(...this.splitText(split, remainingSeparators))
          current = ''
        } else {
          current = split
        }
      }
    }

    if (current.trim()) chunks.push(current.trim())
    return chunks.filter(c => c.length > 0)
  }

  async splitDocuments(documents: Document[]): Promise<Document[]> {
    const results: Document[] = []
    for (const doc of documents) {
      const chunks = this.splitText(doc.pageContent)
      chunks.forEach((chunk, i) => {
        results.push({
          pageContent: chunk,
          metadata: { ...doc.metadata, chunkIndex: i, totalChunks: chunks.length }
        })
      })
    }
    return results
  }
}
```

---

## Full RAG Pipeline Example

```typescript
import {
  TextLoader,
  InMemoryVectorStore,
  FakeEmbeddings,
  ChatAnthropic,
  LLMChain,
  PromptTemplate
} from 'fireworks-plus-plus'

// Custom splitter (from above)
// import { RecursiveCharacterTextSplitter } from './my-splitter'

async function buildRAGPipeline(filePath: string) {
  // 1. Load the document
  const loader = new TextLoader(filePath)
  const docs = await loader.load()
  console.log(`Loaded ${docs.length} document(s)`)

  // 2. Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50
  })
  const chunks = await splitter.splitDocuments(docs)
  console.log(`Split into ${chunks.length} chunks`)

  // 3. Embed and store
  const embeddings = new FakeEmbeddings(256) // Replace with real embeddings in production
  const vectorStore = await InMemoryVectorStore.fromDocuments(chunks, embeddings)
  console.log(`Vector store has ${vectorStore.size} entries`)

  // 4. Build a QA chain
  const llm = new ChatAnthropic()
  const qaPrompt = PromptTemplate.fromTemplate(
    `Use the following context to answer the question.

Context:
{context}

Question: {question}

Answer:`
  )
  const qaChain = new LLMChain(llm, qaPrompt)

  // 5. Retrieval + generation function
  async function ask(question: string): Promise<string> {
    const relevantDocs = await vectorStore.similaritySearch(question, 3)
    const context = relevantDocs.map(d => d.pageContent).join('\n\n')
    return qaChain.run({ context, question })
  }

  return { vectorStore, ask }
}

// Use the pipeline
const { ask } = await buildRAGPipeline('./docs/technical-guide.txt')
const answer = await ask('How do I configure the authentication settings?')
console.log(answer)
```
