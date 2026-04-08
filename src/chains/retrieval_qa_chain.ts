import { BaseChain, type BaseChainConfig } from "./base";
import type { BaseLLM } from "../llms/base";
import type { BaseChatModel } from "../chat_models/base";
import { PromptTemplate } from "../prompts/prompt_template";
import type { BasePromptTemplate } from "../prompts/base";
import type { BaseRetriever } from "../retrievers/base";
import type { ChainValues, Document, Message } from "../schema/types";

export interface RetrievalQAChainConfig extends BaseChainConfig {
  inputKey?: string;
  outputKey?: string;
  returnSourceDocuments?: boolean;
  prompt?: BasePromptTemplate;
}

const DEFAULT_QA_PROMPT = PromptTemplate.fromTemplate(
  "You are a retrieval QA assistant. Use only the provided context to answer the question. " +
    "If the answer cannot be found in the context, say you do not know.\n\n" +
    "Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"
);

/**
 * RetrievalQAChain — retrieve relevant context, then answer with an LLM.
 */
export class RetrievalQAChain extends BaseChain {
  inputKeys: string[];
  outputKeys: string[];

  private inputKey: string;
  private outputKey: string;
  private prompt: BasePromptTemplate;
  private returnSourceDocuments: boolean;

  constructor(
    private llm: BaseLLM | BaseChatModel,
    private retriever: BaseRetriever,
    config: RetrievalQAChainConfig = {}
  ) {
    super(config);
    this.inputKey = config.inputKey ?? "query";
    this.outputKey = config.outputKey ?? "text";
    this.prompt = config.prompt ?? DEFAULT_QA_PROMPT;
    this.returnSourceDocuments = config.returnSourceDocuments ?? false;

    this.inputKeys = [this.inputKey];
    this.outputKeys = this.returnSourceDocuments
      ? [this.outputKey, "sourceDocuments"]
      : [this.outputKey];
  }

  _chainType(): string {
    return "retrieval_qa_chain";
  }

  private isChatModel(llm: BaseLLM | BaseChatModel): llm is BaseChatModel {
    return "generate" in llm && typeof (llm as BaseChatModel).call === "function" &&
      "invoke" in llm;
  }

  private formatContext(documents: Document[]): string {
    return documents
      .map((doc, index) => {
        const source = typeof doc.metadata["source"] === "string"
          ? `Source: ${doc.metadata["source"]}\n`
          : "";
        return `[Document ${index + 1}]\n${source}${doc.pageContent}`;
      })
      .join("\n\n");
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const query = String(inputs[this.inputKey] ?? "");
    const documents = await this.retriever.getRelevantDocuments(query);
    const context = this.formatContext(documents);
    const promptVars = { context, query };

    let text: string;
    if (this.isChatModel(this.llm)) {
      const formattedPrompt = this.prompt.format(promptVars);
      const messages: Message[] = [{ role: "human", content: formattedPrompt }];
      const reply = await this.llm.call(messages);
      text = reply.content;
    } else {
      const formattedPrompt = this.prompt.format(promptVars);
      text = await this.llm.call(formattedPrompt);
    }

    const result: ChainValues = { [this.outputKey]: text };
    if (this.returnSourceDocuments) {
      result["sourceDocuments"] = documents;
    }
    return result;
  }
}
