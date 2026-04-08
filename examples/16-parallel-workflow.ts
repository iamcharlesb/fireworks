import {
  InMemoryWorkflowCheckpointStore,
  WorkflowExecutor,
  WorkflowGraph
} from "../src";

async function main(): Promise<void> {
  const graph = new WorkflowGraph("parallel_support_enrichment");

  graph
    .addNode(
      "fanout",
      () => ({
        parallel: [
          { nodeId: "customer_profile", label: "profile" },
          { nodeId: "account_status", label: "billing" }
        ],
        mergeStrategy: "namespaced",
        namespaceKey: "branchResults",
        next: "compose"
      }),
      { start: true }
    )
    .addNode(
      "customer_profile",
      () => ({
        output: {
          name: "Alice",
          plan: "pro"
        }
      }),
      { terminal: true }
    )
    .addNode(
      "account_status",
      () => ({
        output: {
          delinquent: false,
          currency: "USD"
        }
      }),
      { terminal: true }
    )
    .addNode(
      "compose",
      (state) => {
        const branchResults = state.branchResults as {
          profile: { name: string; plan: string };
          billing: { delinquent: boolean; currency: string };
        };

        return {
          output: {
            summary: `${branchResults.profile.name} on ${branchResults.profile.plan} billed in ${branchResults.billing.currency}`,
            branchResults
          }
        };
      },
      { terminal: true }
    );

  const executor = new WorkflowExecutor(graph, {
    checkpointStore: new InMemoryWorkflowCheckpointStore(),
    threadId: "parallel-example"
  });

  const result = await executor.run({ input: "enrich customer context" });
  console.log("Workflow result:", result.output);
  console.log("History:", result.history);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
