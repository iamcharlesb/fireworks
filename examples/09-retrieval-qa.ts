import {
  ChatAnthropic,
  InMemoryVectorStore,
  OpenAIEmbeddings,
  TextLoader,
  VectorStoreRetriever,
  RetrievalQAChain
} from "../src";

async function main() {
  const loader = new TextLoader("./knowledge-base.txt");
  const docs = await loader.load();

  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY
  });

  const store = await InMemoryVectorStore.fromDocuments(docs, embeddings);
  const retriever = new VectorStoreRetriever(store, { k: 3 });

  const llm = new ChatAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const chain = new RetrievalQAChain(llm, retriever, {
    returnSourceDocuments: true
  });

  const result = await chain.call({
    query: "What does the knowledge base say about the project?"
  });

  console.log(result["text"]);
  console.log("Sources:", (result["sourceDocuments"] as Array<{ metadata: Record<string, unknown> }>).map((d) => d.metadata["source"]));
}

main().catch(console.error);
