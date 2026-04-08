import { BaseChain, type BaseChainConfig } from "./base";
import type { BaseLLM } from "../llms/base";
import type { BaseChatModel } from "../chat_models/base";
import type { BasePromptTemplate } from "../prompts/base";
import type { BaseOutputParser } from "../output_parsers/base";
import type { ChainValues, Message } from "../schema/types";

export interface LLMChainConfig extends BaseChainConfig {
  outputKey?: string;
  outputParser?: BaseOutputParser<unknown>;
}

/**
 * LLMChain — the most fundamental chain: prompt + LLM + optional output parser.
 *
 * @example
 * const llm = new ChatAnthropic({ apiKey: "..." })
 * const prompt = PromptTemplate.fromTemplate("Tell me a joke about {topic}")
 * const chain = new LLMChain(llm, prompt)
 * const result = await chain.run("cats")
 */
export class LLMChain extends BaseChain {
  inputKeys: string[];
  outputKeys: string[];

  private llm: BaseLLM | BaseChatModel;
  private prompt: BasePromptTemplate;
  private outputParser?: BaseOutputParser<unknown>;
  private outputKey: string;

  constructor(
    llm: BaseLLM | BaseChatModel,
    prompt: BasePromptTemplate,
    config: LLMChainConfig = {}
  ) {
    super(config);
    this.llm = llm;
    this.prompt = prompt;
    this.outputParser = config.outputParser;
    this.outputKey = config.outputKey ?? "text";
    this.inputKeys = prompt.getInputVariables();
    this.outputKeys = [this.outputKey];
  }

  _chainType(): string {
    return "llm_chain";
  }

  /** Check if the LLM is a chat model */
  private isChatModel(llm: BaseLLM | BaseChatModel): llm is BaseChatModel {
    return "generate" in llm && typeof (llm as BaseChatModel).call === "function" &&
      "invoke" in llm;
  }

  async _call(inputs: ChainValues): Promise<ChainValues> {
    const stringInputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(inputs)) {
      stringInputs[k] = String(v ?? "");
    }

    let text: string;

    if (this.isChatModel(this.llm)) {
      // Use chat prompt if available
      const formattedPrompt = this.prompt.format(stringInputs);
      const messages: Message[] = [{ role: "human", content: formattedPrompt }];

      // If the prompt is a chat prompt template, use formatMessages
      if ("formatMessages" in this.prompt) {
        const chatPrompt = this.prompt as unknown as { formatMessages(v: Record<string, string>): Message[] };
        const formattedMessages = chatPrompt.formatMessages(stringInputs);
        const reply = await (this.llm as BaseChatModel).call(formattedMessages);
        text = reply.content;
      } else {
        const reply = await (this.llm as BaseChatModel).call(messages);
        text = reply.content;
      }
    } else {
      const formattedPrompt = this.prompt.format(stringInputs);
      text = await (this.llm as BaseLLM).call(formattedPrompt);
    }

    if (this.outputParser) {
      const parsed = this.outputParser.parse(text);
      return { [this.outputKey]: parsed };
    }

    return { [this.outputKey]: text };
  }

  /**
   * Convenience: run with a single string input, return text output.
   */
  async run(input: string | Record<string, string>): Promise<string> {
    const inputs: Record<string, string> =
      typeof input === "string"
        ? { [this.inputKeys[0] ?? "input"]: input }
        : input;

    const result = await this.call(inputs);
    const output = result[this.outputKey];
    return typeof output === "string" ? output : JSON.stringify(output);
  }

  /**
   * Predict — alias for run().
   */
  async predict(inputs: Record<string, string>): Promise<string> {
    return this.run(inputs);
  }
}
