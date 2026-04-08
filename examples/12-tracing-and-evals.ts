import {
  CostTrackingHandler,
  ExactMatchEvaluator,
  LoggingCallbackHandler,
  PromptTemplate,
  StreamingCallbackHandler,
  TracingCallbackHandler,
  runEvaluation
} from "../src";

async function main(): Promise<void> {
  const logger = new LoggingCallbackHandler({ level: "info", prefix: "[Example]" });
  const streaming = new StreamingCallbackHandler((token) => process.stdout.write(token));
  const tracing = new TracingCallbackHandler();
  const costs = new CostTrackingHandler();

  console.log("Prompt example:");
  const prompt = PromptTemplate.fromTemplate("Summarize {topic} in one sentence.");
  console.log(prompt.format({ topic: "TypeScript callbacks" }));

  console.log("\nCallback handlers available:");
  console.log([
    logger.constructor.name,
    streaming.constructor.name,
    tracing.constructor.name,
    costs.constructor.name
  ]);

  await tracing.onChainStart("demo_chain", { input: "Paris" }, "chain_demo");
  await tracing.onLLMStart("demo_llm", ["Paris"], "llm_demo");
  await tracing.onLLMNewToken("Paris", "llm_demo");
  await tracing.onLLMEnd(
    {
      generations: [[{ text: "Paris", message: { role: "ai", content: "Paris" } }]],
      llmOutput: {
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4
        },
        model: "gpt-4o-mini"
      }
    },
    "llm_demo"
  );
  await tracing.onChainEnd({ output: "Paris" }, "chain_demo");
  await costs.onLLMEnd(
    {
      generations: [[{ text: "Paris" }]],
      llmOutput: {
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4
        },
        model: "gpt-4o-mini"
      }
    },
    "llm_demo"
  );

  console.log("\nTrace summary:");
  console.log(tracing.getSummary());

  console.log("\nCost summary:");
  console.log(costs.getSummary());

  const evaluation = await runEvaluation({
    cases: [
      { id: "capital_france", input: "France", expected: "Paris" },
      { id: "capital_japan", input: "Japan", expected: "Tokyo" }
    ],
    target: async (country) => {
      const lookup: Record<string, string> = {
        France: "Paris",
        Japan: "Tokyo"
      };
      return lookup[country] ?? "Unknown";
    },
    evaluator: new ExactMatchEvaluator()
  });

  console.log("\nEvaluation summary:");
  console.log(evaluation);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
