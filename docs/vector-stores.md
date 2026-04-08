# Vector Stores

Vector stores enable semantic (similarity) search over document collections. Documents are embedded into numerical vectors, stored, and later searched by comparing a query vector against all stored vectors using cosine similarity.

## VectorStore Base

```typescript
abstract class VectorStore {
  constructor(embeddings: BaseEmbeddings)

  // Add documents (embeds them first)
  abstract addDocuments(documents: Document[]): Promise<void>

  // Add pre-computed vectors
  abstract addVectors(vectors: number[][], documents: Document[]): Promise<void>

  // Search with scores
  abstract similaritySearchWithScore(
    query: string,
    k: number,
    filter?: Record<string, unknown>
  ): Promise<SimilarityResult[]>

  // Search without scores (convenience)
  similaritySearch(
    query: string,
    k: number,
    filter?: Record<string, unknown>
  ): Promise<Document[]>
}

interface SimilarityResult {
  document: Document
  score: number   // Cosine similarity: 1.0 = identical, 0.0 = unrelated
}
```

---

## InMemoryVectorStore

A fully in-memory vector store that uses cosine similarity. No external dependencies, no network calls. Ideal for development, testing, and production datasets up to hundreds of thousands of documents.

```typescript
import { InMemoryVectorStore, FakeEmbeddings } from 'fireworks-plus-plus'
import type { Document } from 'fireworks-plus-plus'

const embeddings = new FakeEmbeddings(128)
const store = new InMemoryVectorStore(embeddings)

// Add documents
const docs: Document[] = [
  { pageContent: 'The capital of France is Paris.', metadata: { topic: 'geography' } },
  { pageContent: 'Paris is famous for the Eiffel Tower.', metadata: { topic: 'landmarks' } },
  { pageContent: 'JavaScript is a programming language.', metadata: { topic: 'tech' } },
  { pageContent: 'TypeScript adds types to JavaScript.', metadata: { topic: 'tech' } }
]

await store.addDocuments(docs)
console.log(store.size) // 4

// Similarity search — top 2 most relevant to the query
const results = await store.similaritySearch('What is special about France?', 2)
results.forEach(doc => {
  console.log(doc.pageContent)
  console.log('Source topic:', doc.metadata['topic'])
})

// Search with scores
const scored = await store.similaritySearchWithScore('programming languages', 3)
scored.forEach(({ document, score }) => {
  console.log(`[${score.toFixed(3)}] ${document.pageContent}`)
})
```

### Static Factory Methods

```typescript
// From Document objects
const store1 = await InMemoryVectorStore.fromDocuments(docs, embeddings)

// From raw text strings
const store2 = await InMemoryVectorStore.fromTexts(
  ['First document text', 'Second document text', 'Third document text'],
  [{ id: 1 }, { id: 2 }, { id: 3 }],
  embeddings
)
```

### Filtered Search

Filter results by metadata fields before ranking:

```typescript
// Only search documents with topic = "tech"
const techDocs = await store.similaritySearch(
  'typed programming',
  3,
  { topic: 'tech' }  // metadata filter
)
```

### Deleting Documents

Remove documents matching a metadata filter:

```typescript
// Remove all documents from topic "geography"
await store.delete({ topic: 'geography' })
console.log(store.size) // 3
```

---

## Embeddings

Embeddings convert text into numerical vectors. Fireworks++ includes `FakeEmbeddings` for testing and ships `OpenAIEmbeddings` for production usage with the OpenAI embeddings API.

### FakeEmbeddings

Deterministic, hash-based embeddings. No API key, no network. Use for development, unit tests, and exploring the API.

```typescript
import { FakeEmbeddings } from 'fireworks-plus-plus'

const embeddings = new FakeEmbeddings(128) // 128-dimensional vectors

const vector = await embeddings.embedQuery('hello world')
console.log(vector.length)    // 128
console.log(typeof vector[0]) // "number"

// Deterministic: same text always produces the same vector
const v1 = await embeddings.embedQuery('test')
const v2 = await embeddings.embedQuery('test')
console.log(v1[0] === v2[0]) // true

// Embed multiple documents at once
const vectors = await embeddings.embedDocuments(['doc one', 'doc two', 'doc three'])
console.log(vectors.length)   // 3
```

### BaseEmbeddings

Use `OpenAIEmbeddings` for a real hosted embedding provider:

```typescript
import { OpenAIEmbeddings } from 'fireworks-plus-plus'

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small'
})

// Use it exactly like FakeEmbeddings
const store = await InMemoryVectorStore.fromDocuments(docs, embeddings)
```

### Retrievers

Use `VectorStoreRetriever` when you want a reusable retrieval component instead of calling the vector store directly:

```typescript
import { VectorStoreRetriever } from 'fireworks-plus-plus'

const retriever = new VectorStoreRetriever(store, {
  k: 4,
  searchType: 'similarity' // or 'mmr'
})

const docs = await retriever.getRelevantDocuments('typed programming language')
```

### Static Utilities on BaseEmbeddings

```typescript
import { BaseEmbeddings } from 'fireworks-plus-plus'

// Cosine similarity between two vectors (range: -1 to 1)
const similarity = BaseEmbeddings.cosineSimilarity(vectorA, vectorB)
console.log(similarity) // e.g. 0.872

// Normalize a vector to unit length
const normalized = BaseEmbeddings.normalize([3, 4])
console.log(normalized) // [0.6, 0.8]
```

---

## Complete RAG Example

```typescript
import {
  InMemoryVectorStore,
  FakeEmbeddings,
  TextLoader,
  ChatAnthropic,
  LLMChain,
  PromptTemplate
} from 'fireworks-plus-plus'
import type { Document } from 'fireworks-plus-plus'

// --- 1. Build the knowledge base ---

const loader = new TextLoader('./knowledge-base.txt')
const rawDocs = await loader.load()

// Simple paragraph splitter
function splitIntoParagraphs(docs: Document[]): Document[] {
  const results: Document[] = []
  for (const doc of docs) {
    const paragraphs = doc.pageContent.split(/\n{2,}/).filter(p => p.trim().length > 50)
    paragraphs.forEach((para, i) => {
      results.push({
        pageContent: para.trim(),
        metadata: { ...doc.metadata, paragraph: i }
      })
    })
  }
  return results
}

const chunks = splitIntoParagraphs(rawDocs)
const store = await InMemoryVectorStore.fromDocuments(chunks, new FakeEmbeddings(256))
console.log(`Knowledge base: ${store.size} chunks`)

// --- 2. Build the QA function ---

const llm = new ChatAnthropic()
const prompt = PromptTemplate.fromTemplate(
  `You are a helpful assistant. Use only the provided context to answer the question.
If the context does not contain enough information, say so.

Context:
{context}

Question: {question}

Answer:`
)
const chain = new LLMChain(llm, prompt)

async function answerQuestion(question: string): Promise<{ answer: string; sources: string[] }> {
  const relevant = await store.similaritySearchWithScore(question, 4)

  // Filter to reasonably relevant chunks only (score > 0.3)
  const filtered = relevant.filter(r => r.score > 0.3)

  if (filtered.length === 0) {
    return {
      answer: 'No relevant information found in the knowledge base.',
      sources: []
    }
  }

  const context = filtered.map(r => r.document.pageContent).join('\n\n---\n\n')
  const sources = [...new Set(filtered.map(r => String(r.document.metadata['source'] ?? '')))]

  const answer = await chain.run({ context, question })

  return { answer, sources }
}

// --- 3. Use it ---

const { answer, sources } = await answerQuestion('How do I configure authentication?')
console.log('Answer:', answer)
console.log('Sources:', sources)
```
