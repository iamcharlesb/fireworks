import {
  ChatOpenAI,
  DynamicTool
} from "../src";

async function main() {
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const weatherTool = new DynamicTool({
    name: "get_weather",
    description: "Get the weather for a city. Input should be the city name.",
    func: async (input) => ({
      output: `It is sunny in ${input}.`
    })
  });

  const toolReply = await llm.callWithTools(
    [{ role: "human", content: "What is the weather in Tokyo?" }],
    [weatherTool.toSchema()],
    { toolChoice: "auto" }
  );

  console.log("Assistant tool reply:", toolReply);

  if (toolReply.toolCalls && toolReply.toolCalls.length > 0) {
    const toolCall = toolReply.toolCalls[0];
    const args = JSON.parse(toolCall.arguments) as { input?: string; city?: string };
    const toolInput = args.input ?? args.city ?? "Tokyo";
    const toolOutput = await weatherTool.run(toolInput);

    const finalReply = await llm.call([
      { role: "human", content: "What is the weather in Tokyo?" },
      {
        role: "ai",
        content: toolReply.content,
        toolCalls: toolReply.toolCalls
      },
      {
        role: "tool",
        content: toolOutput,
        toolCallId: toolCall.id
      }
    ]);

    console.log("Final answer:", finalReply.content);
  }

  const structured = await llm.generateStructured(
    [{ role: "human", content: "Return the capital of France." }],
    {
      name: "capital_answer",
      schema: {
        type: "object",
        properties: {
          country: { type: "string" },
          capital: { type: "string" }
        },
        required: ["country", "capital"],
        additionalProperties: false
      }
    }
  );

  console.log("Structured output:", structured);
}

main().catch(console.error);
