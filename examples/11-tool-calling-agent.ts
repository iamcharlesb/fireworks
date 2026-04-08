import {
  ChatOpenAI,
  ToolCallingAgent,
  ToolCallingAgentExecutor,
  DynamicTool
} from "../src";

async function main() {
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const weatherTool = new DynamicTool({
    name: "get_weather",
    description: "Get the current weather for a city. Input should be the city name.",
    func: async (input) => ({
      output: `It is sunny in ${input}.`
    })
  });

  const calculatorTool = new DynamicTool({
    name: "double_number",
    description: "Double a number. Input should be a number string.",
    func: async (input) => {
      const value = Number(input);
      return { output: Number.isFinite(value) ? String(value * 2) : "NaN" };
    }
  });

  const agent = new ToolCallingAgent(llm, [weatherTool, calculatorTool], {
    systemPrompt: "Use tools whenever they help you answer accurately."
  });

  const executor = new ToolCallingAgentExecutor(agent, {
    maxIterations: 8,
    returnIntermediateSteps: true,
    verbose: true
  });

  const result = await executor.call({
    input: "What is the weather in Tokyo, and what is double 21?"
  });

  console.log("Final answer:", result.output);
  console.log("Intermediate steps:", result.intermediateSteps);
}

main().catch(console.error);
