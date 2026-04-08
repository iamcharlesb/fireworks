import { createAgent } from "../src";

async function main(): Promise<void> {
  const agent = createAgent({
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    tools: {
      weather: async (input) => `Sunny in ${input}`
    }
  });

  const result = await agent.ask("Use the weather tool for Tokyo");

  console.log("Text:", result.text);
  console.log("Status:", result.status);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
