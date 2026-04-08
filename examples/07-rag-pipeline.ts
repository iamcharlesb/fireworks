/**
 * Example 07: RAG Pipeline
 *
 * Demonstrates:
 * - Loading a text document with TextLoader
 * - Splitting into chunks manually
 * - Embedding with FakeEmbeddings (swap for real embeddings in production)
 * - Storing in InMemoryVectorStore
 * - Semantic similarity search
 * - Filtered search by metadata
 * - Retrieval-Augmented Generation (RAG) QA
 * - fromTexts and fromDocuments factory methods
 */
import {
  ChatAnthropic,
  TextLoader,
  InMemoryVectorStore,
  FakeEmbeddings,
  LLMChain,
  PromptTemplate
} from '../src'
import type { Document } from '../src'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split text into fixed-size chunks with overlap. */
function chunkText(text: string, chunkSize = 400, overlap = 80): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end).trim())
    start += chunkSize - overlap
  }
  return chunks.filter(c => c.length > 20)
}

/** Split documents into chunks, preserving metadata. */
function splitDocuments(docs: Document[], chunkSize = 400, overlap = 80): Document[] {
  const results: Document[] = []
  for (const doc of docs) {
    const chunks = chunkText(doc.pageContent, chunkSize, overlap)
    chunks.forEach((chunk, i) => {
      results.push({
        pageContent: chunk,
        metadata: { ...doc.metadata, chunkIndex: i, totalChunks: chunks.length }
      })
    })
  }
  return results
}

// ── Create sample documents on disk ──────────────────────────────────────────

async function createSampleFiles(tmpDir: string): Promise<string[]> {
  const files = [
    {
      name: 'typescript.txt',
      content: `TypeScript is a strongly typed programming language that builds on JavaScript.
It was developed by Microsoft and first released in 2012.
TypeScript adds optional static typing and class-based object-oriented programming to JavaScript.

TypeScript compiles to plain JavaScript, which means it can run anywhere JavaScript runs.
The TypeScript compiler (tsc) performs type checking and transpiles TypeScript code to JavaScript.

Key features of TypeScript include:
- Static type checking at compile time
- Interfaces and type aliases for defining contracts
- Generics for reusable type-safe components
- Enums for named constant groups
- Decorators for metadata annotation
- Advanced type inference

TypeScript is widely adopted in large-scale applications and is the primary language for Angular.
React and Vue also have excellent TypeScript support.`
    },
    {
      name: 'fireworks-plus-plus.txt',
      content: `Fireworks++ is a TypeScript-first framework for building LLM-powered applications.
It provides abstractions for chains, agents, tools, memory, and vector stores.

The framework supports multiple LLM providers:
- Anthropic Claude models via the Anthropic API
- OpenAI GPT models via the OpenAI API
- Perplexity for web-grounded responses
- Ollama for running models locally

Fireworks++ chains are composable units that combine prompts with LLMs.
The LLMChain is the most fundamental chain type.
SequentialChain runs multiple chains in order, passing outputs as inputs.
RouterChain dispatches requests to different chains based on intent.

The memory system supports multiple strategies:
- ConversationBufferMemory stores all messages verbatim
- ConversationWindowMemory keeps only the last k exchanges
- ConversationSummaryMemory uses an LLM to compress history
- ThreadedMemory manages multiple independent conversation threads

The SafetyPolicy class filters harmful content before it reaches the LLM.`
    }
  ]

  const filePaths: string[] = []
  for (const file of files) {
    const filePath = path.join(tmpDir, file.name)
    await fs.writeFile(filePath, file.content, 'utf-8')
    filePaths.push(filePath)
  }

  return filePaths
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'your-api-key',
    temperature: 0.1
  })

  // Create sample text files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fireworks-plus-plus-rag-'))
  const filePaths = await createSampleFiles(tmpDir)
  console.log(`Created ${filePaths.length} sample files in ${tmpDir}`)

  // ── Step 1: Load documents ────────────────────────────────────────────────
  console.log('\n=== Step 1: Load Documents ===')

  const allDocs: Document[] = []
  for (const filePath of filePaths) {
    const loader = new TextLoader(filePath)
    const docs = await loader.load()
    allDocs.push(...docs)
    console.log(`Loaded: ${path.basename(filePath)} (${docs[0].pageContent.length} chars)`)
  }
  console.log(`Total documents: ${allDocs.length}`)

  // ── Step 2: Split into chunks ─────────────────────────────────────────────
  console.log('\n=== Step 2: Split Documents ===')

  const chunks = splitDocuments(allDocs, 300, 50)
  console.log(`Split into ${chunks.length} chunks`)
  chunks.forEach((chunk, i) => {
    console.log(`  Chunk ${i}: ${chunk.pageContent.length} chars from ${path.basename(String(chunk.metadata['source']))}`)
  })

  // ── Step 3: Create embeddings and vector store ────────────────────────────
  console.log('\n=== Step 3: Create Vector Store ===')

  // In production, replace FakeEmbeddings with a real provider:
  // import { OpenAIEmbeddings } from './my-embeddings'
  // const embeddings = new OpenAIEmbeddings()
  const embeddings = new FakeEmbeddings(256)

  const store = await InMemoryVectorStore.fromDocuments(chunks, embeddings)
  console.log(`Vector store created with ${store.size} entries`)

  // ── Step 4: Similarity search ─────────────────────────────────────────────
  console.log('\n=== Step 4: Similarity Search ===')

  const queries = [
    'What is TypeScript?',
    'Tell me about memory in Fireworks++',
    'What LLM providers are supported?'
  ]

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`)
    const results = await store.similaritySearchWithScore(query, 2)
    results.forEach(({ document, score }, i) => {
      console.log(`  [${i + 1}] Score: ${score.toFixed(3)} — "${document.pageContent.slice(0, 80)}..."`)
      console.log(`       Source: ${path.basename(String(document.metadata['source']))}`)
    })
  }

  // ── Step 5: Filtered search ───────────────────────────────────────────────
  console.log('\n=== Step 5: Filtered Search ===')

  const tsFile = path.join(tmpDir, 'typescript.txt')
  const filteredResults = await store.similaritySearch(
    'programming language features',
    3,
    { source: path.resolve(tsFile) }
  )
  console.log(`Filtered search (typescript.txt only): ${filteredResults.length} results`)
  filteredResults.forEach(doc => {
    console.log(`  "${doc.pageContent.slice(0, 80)}..."`)
  })

  // ── Step 6: fromTexts factory ─────────────────────────────────────────────
  console.log('\n=== Step 6: InMemoryVectorStore.fromTexts() ===')

  const quickStore = await InMemoryVectorStore.fromTexts(
    [
      'The sky is blue.',
      'TypeScript is a superset of JavaScript.',
      'Cats are independent animals.',
      'Node.js runs JavaScript on the server.'
    ],
    [
      { category: 'science' },
      { category: 'tech' },
      { category: 'animals' },
      { category: 'tech' }
    ],
    new FakeEmbeddings()
  )
  console.log(`Quick store created with ${quickStore.size} entries`)

  const techResults = await quickStore.similaritySearch('JavaScript programming', 2, { category: 'tech' })
  console.log('Tech results:')
  techResults.forEach(d => console.log(`  - ${d.pageContent}`))

  // ── Step 7: RAG QA chain ──────────────────────────────────────────────────
  console.log('\n=== Step 7: RAG Question Answering ===')

  const qaPrompt = PromptTemplate.fromTemplate(
    `You are a knowledgeable assistant. Use only the context below to answer the question.
If the context does not contain enough information to answer, say "I don't have that information."

Context:
{context}

Question: {question}

Answer:`
  )
  const qaChain = new LLMChain(llm, qaPrompt)

  async function askQuestion(question: string): Promise<void> {
    // Retrieve the most relevant chunks
    const relevant = await store.similaritySearchWithScore(question, 3)
    const filtered = relevant.filter(r => r.score > 0.1)

    if (filtered.length === 0) {
      console.log(`Q: ${question}`)
      console.log('A: No relevant context found.')
      return
    }

    const context = filtered.map(r => r.document.pageContent).join('\n\n')
    const answer = await qaChain.run({ context, question })

    console.log(`Q: ${question}`)
    console.log(`A: ${answer.slice(0, 300)}`)
    console.log()
  }

  await askQuestion('What is TypeScript and who made it?')
  await askQuestion('What memory strategies does Fireworks++ support?')
  await askQuestion('Can I run Fireworks++ with local models?')
  await askQuestion('What is the speed of light?')  // Not in context

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true })
  console.log('Cleaned up temporary files.')
}

main().catch(console.error)
