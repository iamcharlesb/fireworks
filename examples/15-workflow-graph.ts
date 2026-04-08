import {
  FileWorkflowCheckpointStore,
  WorkflowExecutor,
  WorkflowGraph
} from "../src";

async function main(): Promise<void> {
  const graph = new WorkflowGraph("support_workflow");

  graph
    .addNode(
      "triage",
      (state) => ({
        state: {
          route: String(state.input).includes("urgent") ? "review" : "draft"
        }
      }),
      { start: true }
    )
    .addConditionalEdges("triage", [
      {
        to: "review",
        label: "review",
        condition: (state) => state.route === "review"
      },
      {
        to: "draft",
        label: "draft",
        condition: (state) => state.route === "draft"
      }
    ])
    .addNode("review", (state) => {
      if (!state.reviewed) {
        return {
          pause: true,
          pauseReason: "Awaiting operator review",
          next: "draft"
        };
      }

      return { next: "draft" };
    })
    .addNode("draft", (state) => ({
      state: {
        reply:
          state.route === "review"
            ? `Escalated reply with notes: ${state.reviewNotes ?? "none"}`
            : "Standard reply"
      }
    }))
    .addEdge("draft", "done")
    .addNode(
      "done",
      (state) => ({
        output: {
          reply: state.reply,
          route: state.route
        }
      }),
      { terminal: true }
    );

  const store = new FileWorkflowCheckpointStore({
    directory: "./.fireworks-plus-plus/example-workflows"
  });
  const executor = new WorkflowExecutor(graph, {
    checkpointStore: store,
    threadId: "support-example"
  });

  const first = await executor.run({ input: "urgent customer escalation" });
  console.log("First run:", {
    status: first.status,
    currentNodeId: first.currentNodeId,
    pauseReason: first.pauseReason,
    history: first.history
  });

  const resumed = await executor.resume("support-example", {
    reviewed: true,
    reviewNotes: "High priority customer, approved response"
  });

  console.log("Resumed result:", {
    status: resumed.status,
    output: resumed.output,
    history: resumed.history
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
