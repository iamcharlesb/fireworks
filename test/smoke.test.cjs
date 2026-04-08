const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const {
  IntentRouter,
  HeuristicRouter,
  RouterChain,
  CostTrackingHandler,
  ContainsStringEvaluator,
  DynamicTool,
  DocumentTool,
  EditorTool,
  ExactMatchEvaluator,
  BaseChatModel,
  ChatAnthropic,
  ChatGemini,
  ChatOpenAI,
  AlertManager,
  ConnectorDispatcher,
  InMemoryMCPTransport,
  FileCheckpointStore,
  FileWorkflowCheckpointStore,
  FakeEmbeddings,
  FileAuditLogger,
  HS256Authenticator,
  GovernanceBudgetHandler,
  InMemoryCheckpointStore,
  InMemoryAuditLogger,
  InMemoryWorkflowCheckpointStore,
  InMemoryVectorStore,
  KafkaRestConnector,
  loadMonitoringSnapshot,
  ManagementServer,
  MCPClient,
  MCPServer,
  OpenAIEmbeddings,
  PolicyEngine,
  PluginRegistry,
  RBACAuthorizer,
  RestConnector,
  renderMonitoringDashboardHtml,
  RetrievalQAChain,
  ScopedBudgetManager,
  SplunkHECConnector,
  TracingCallbackHandler,
  createAgent,
  ToolCallingAgent,
  ToolCallingAgentExecutor,
  BudgetManager,
  VectorStoreRetriever,
  WebhookConnector,
  WorkflowExecutor,
  WorkflowGraph,
  runEvaluation
} = require("../dist");

test("IntentRouter returns a full RouteDecision", async () => {
  const router = new IntentRouter();
  const decision = await router.route("calculate 2 + 2");
  const withConfidence = await router.routeWithConfidence("calculate 2 + 2");

  assert.equal(decision.kind, "calculator");
  assert.equal(withConfidence.kind, decision.kind);
  assert.equal(typeof decision.confidence, "number");
});

test("RouterChain routes using RouteDecision.kind", async () => {
  const router = {
    async route(input) {
      const heuristic = new HeuristicRouter();
      return heuristic.route(input);
    }
  };

  const calculatorChain = {
    inputKeys: ["input"],
    outputKeys: ["output"],
    _chainType() {
      return "calculator_chain";
    },
    async call(inputs) {
      return { output: `calc:${inputs.input}` };
    }
  };

  const defaultChain = {
    inputKeys: ["input"],
    outputKeys: ["output"],
    _chainType() {
      return "default_chain";
    },
    async call(inputs) {
      return { output: `default:${inputs.input}` };
    }
  };

  const chain = new RouterChain(router, { calculator: calculatorChain }, defaultChain);
  const result = await chain.call({ input: "what is 4 * 5?" });

  assert.equal(result.destination, "calculator");
  assert.equal(result.output, "calc:what is 4 * 5?");
});

test("DocumentTool and EditorTool expose the documented config shape", async () => {
  const documentTool = new DocumentTool({ outputDir: "./tmp-docs", defaultFormat: "md" });
  const editorTool = new EditorTool({ workspacePath: process.cwd(), editor: "code" });
  const dynamicTool = new DynamicTool({
    name: "echo",
    description: "Echo input",
    func: async (input) => ({ output: input })
  });

  assert.equal(documentTool.name, "document");
  assert.equal(editorTool.name, "editor");
  assert.equal(await dynamicTool.run("ok"), "ok");
});

test("EditorTool blocks sibling directory traversal outside the workspace root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-editor-"));
  const workspacePath = path.join(root, "workspace");
  const siblingPath = path.join(root, "workspace-evil");
  const allowedPath = path.join(workspacePath, "allowed.txt");
  const blockedPath = path.join(siblingPath, "blocked.txt");

  await fs.mkdir(workspacePath, { recursive: true });
  await fs.mkdir(siblingPath, { recursive: true });
  await fs.writeFile(allowedPath, "ok", "utf8");
  await fs.writeFile(blockedPath, "secret", "utf8");

  const editorTool = new EditorTool({ workspacePath });
  const allowed = await editorTool.call(JSON.stringify({ action: "read", path: "allowed.txt" }));
  const blocked = await editorTool.call(JSON.stringify({ action: "read", path: "../workspace-evil/blocked.txt" }));

  assert.match(allowed.output, /allowed\.txt/);
  assert.equal(blocked.error, "Path traversal detected: ../workspace-evil/blocked.txt is outside workspace");
  assert.match(blocked.output, /Security error: Path traversal detected/);
});

test("VectorStoreRetriever returns relevant documents and RetrievalQAChain returns sources", async () => {
  class FakeChatModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "fake-chat-model";
    }

    _modelType() {
      return "fake-chat-model";
    }

    async generate(messageBatches) {
      const prompt = messageBatches[0][0].content;
      const hasRelevantContext = prompt.includes("Bananas are yellow fruits");
      const text = hasRelevantContext
        ? "Bananas are yellow fruits."
        : "I do not know.";

      return {
        generations: [[{ text, message: { role: "ai", content: text } }]]
      };
    }
  }

  const docs = [
    { pageContent: "Apples are often red fruits.", metadata: { id: "apple" } },
    { pageContent: "Bananas are yellow fruits.", metadata: { id: "banana" } }
  ];

  const store = await InMemoryVectorStore.fromDocuments(docs, new FakeEmbeddings(128));
  const retriever = new VectorStoreRetriever(store, { k: 1 });
  const chain = new RetrievalQAChain(new FakeChatModel(), retriever, {
    returnSourceDocuments: true
  });

  const relevant = await retriever.getRelevantDocuments("Bananas are yellow fruits");
  const result = await chain.call({ query: "Bananas are yellow fruits" });

  assert.equal(relevant.length, 1);
  assert.equal(relevant[0].metadata.id, "banana");
  assert.equal(result.text, "Bananas are yellow fruits.");
  assert.equal(result.sourceDocuments.length, 1);
  assert.equal(result.sourceDocuments[0].metadata.id, "banana");
});

test("OpenAIEmbeddings batches and parses embeddings responses", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);

    return {
      ok: true,
      async json() {
        return {
          data: body.input.map((text, index) => ({
            index,
            embedding: [String(text).length, index]
          }))
        };
      }
    };
  };

  try {
    const embeddings = new OpenAIEmbeddings({
      apiKey: "test-key",
      batchSize: 2
    });

    const vectors = await embeddings.embedDocuments(["a", "bb", "ccc"]);
    const queryVector = await embeddings.embedQuery("dddd");

    assert.equal(calls.length, 3);
    assert.deepEqual(vectors, [[1, 0], [2, 1], [3, 0]]);
    assert.deepEqual(queryVector, [4, 0]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ChatOpenAI supports native tool calling and structured output", async () => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (body.response_format) {
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({ answer: "Paris" })
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "get_weather",
                      arguments: JSON.stringify({ city: "Tokyo" })
                    }
                  }
                ]
              },
              finish_reason: "tool_calls"
            }
          ],
          model: "gpt-4o"
        };
      }
    };
  };

  try {
    const llm = new ChatOpenAI({ apiKey: "test-key" });
    const toolReply = await llm.callWithTools(
      [{ role: "human", content: "Weather in Tokyo?" }],
      [
        {
          name: "get_weather",
          description: "Get weather by city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string" }
            },
            required: ["city"]
          }
        }
      ],
      { toolChoice: "required" }
    );

    const structured = await llm.generateStructured(
      [{ role: "human", content: "What is the capital of France?" }],
      {
        name: "capital_answer",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" }
          },
          required: ["answer"]
        }
      }
    );

    assert.equal(requests[0].tool_choice, "required");
    assert.equal(requests[0].tools[0].function.name, "get_weather");
    assert.equal(toolReply.toolCalls[0].name, "get_weather");
    assert.deepEqual(JSON.parse(toolReply.toolCalls[0].arguments), { city: "Tokyo" });
    assert.equal(requests[1].response_format.type, "json_schema");
    assert.deepEqual(structured, { answer: "Paris" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("ChatAnthropic supports native tool calling and structured output", async () => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    if (body.tool_choice && body.tool_choice.type === "tool") {
      return {
        ok: true,
        async json() {
          return {
            content: [
              {
                type: "tool_use",
                id: "toolu_structured",
                name: body.tool_choice.name,
                input: { answer: "Paris" }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "get_weather",
              input: { city: "Tokyo" }
            }
          ]
        };
      }
    };
  };

  try {
    const llm = new ChatAnthropic({ apiKey: "test-key" });
    const toolReply = await llm.callWithTools(
      [{ role: "human", content: "Weather in Tokyo?" }],
      [
        {
          name: "get_weather",
          description: "Get weather by city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string" }
            },
            required: ["city"]
          }
        }
      ],
      { toolChoice: "required" }
    );

    const structured = await llm.generateStructured(
      [{ role: "human", content: "What is the capital of France?" }],
      {
        name: "capital_answer",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" }
          },
          required: ["answer"]
        }
      }
    );

    assert.equal(requests[0].tool_choice.type, "any");
    assert.equal(requests[0].tools[0].name, "get_weather");
    assert.equal(toolReply.toolCalls[0].name, "get_weather");
    assert.deepEqual(JSON.parse(toolReply.toolCalls[0].arguments), { city: "Tokyo" });
    assert.equal(requests[1].tool_choice.type, "tool");
    assert.equal(requests[1].tool_choice.name, "capital_answer");
    assert.deepEqual(structured, { answer: "Paris" });
  } finally {
    global.fetch = originalFetch;
  }
});

test("ToolCallingAgentExecutor handles multiple tool calls and final answer", async () => {
  class FakeToolCallingModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "fake-tool-calling-model";
      this.callCount = 0;
    }

    _modelType() {
      return "fake-tool-calling-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      this.callCount += 1;

      if (this.callCount === 1) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "tool_1",
              name: "uppercase",
              arguments: JSON.stringify({ input: "tokyo" })
            },
            {
              id: "tool_2",
              name: "reverse",
              arguments: JSON.stringify({ input: "paris" })
            }
          ]
        };
      }

      const toolMessages = messages.filter((msg) => msg.role === "tool");
      return {
        role: "ai",
        content: `Results: ${toolMessages.map((msg) => msg.content).join(" | ")}`
      };
    }
  }

  const uppercase = new DynamicTool({
    name: "uppercase",
    description: "Uppercase text",
    func: async (input) => ({ output: input.toUpperCase() })
  });
  const reverse = new DynamicTool({
    name: "reverse",
    description: "Reverse text",
    func: async (input) => ({ output: input.split("").reverse().join("") })
  });

  const agent = new ToolCallingAgent(
    new FakeToolCallingModel(),
    [uppercase, reverse]
  );
  const executor = new ToolCallingAgentExecutor(agent, {
    returnIntermediateSteps: true
  });

  const result = await executor.call({ input: "Run the tools" });

  assert.equal(result.output, "Results: TOKYO | sirap");
  assert.equal(result.intermediateSteps.length, 2);
  assert.equal(result.intermediateSteps[0][0].tool, "uppercase");
  assert.equal(result.intermediateSteps[1][0].tool, "reverse");
});

test("ToolCallingAgentExecutor can force a final answer after max iterations", async () => {
  class LoopingToolModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "looping-tool-model";
    }

    _modelType() {
      return "looping-tool-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(_messages, _tools, options) {
      if (options && options.toolChoice === "none") {
        return { role: "ai", content: "Forced final answer" };
      }

      return {
        role: "ai",
        content: "",
        toolCalls: [
          {
            id: "tool_loop",
            name: "echo",
            arguments: JSON.stringify({ input: "loop" })
          }
        ]
      };
    }
  }

  const echo = new DynamicTool({
    name: "echo",
    description: "Echo text",
    func: async (input) => ({ output: input })
  });

  const agent = new ToolCallingAgent(new LoopingToolModel(), [echo]);
  const executor = new ToolCallingAgentExecutor(agent, {
    maxIterations: 1,
    earlyStoppingMethod: "generate"
  });

  const output = await executor.run("Loop once");
  assert.equal(output, "Forced final answer");
});

test("TracingCallbackHandler records nested runs and agent events", async () => {
  const tracing = new TracingCallbackHandler();

  await tracing.onChainStart("retrieval_qa", { input: "Where is Paris?" }, "chain_1");
  await tracing.onLLMStart("chat_openai", ["Where is Paris?"], "llm_1");
  await tracing.onLLMNewToken("Paris", "llm_1");
  await tracing.onLLMNewToken(".", "llm_1");
  await tracing.onLLMEnd(
    {
      generations: [[{ text: "Paris.", message: { role: "ai", content: "Paris." } }]],
      llmOutput: {
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2
        }
      }
    },
    "llm_1"
  );
  await tracing.onAgentAction(
    { tool: "search", toolInput: "Paris", log: "searching" },
    "chain_1"
  );
  await tracing.onAgentFinish(
    { returnValues: { output: "Paris is in France." }, log: "done" },
    "chain_1"
  );
  await tracing.onChainEnd({ output: "Paris is in France." }, "chain_1");

  const summary = tracing.getSummary();
  const roots = tracing.getRootRuns();
  const chainRun = tracing.getRun("chain_1");
  const llmRun = tracing.getRun("llm_1");

  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.rootRuns, 1);
  assert.equal(summary.chainRuns, 1);
  assert.equal(summary.llmRuns, 1);
  assert.equal(summary.totalTokens, 2);
  assert.equal(roots.length, 1);
  assert.equal(chainRun.children[0], "llm_1");
  assert.equal(chainRun.events.length, 2);
  assert.equal(llmRun.parentRunId, "chain_1");
  assert.equal(llmRun.status, "success");
});

test("CostTrackingHandler aggregates usage and approximate cost by model", async () => {
  const tracker = new CostTrackingHandler();

  await tracker.onLLMEnd(
    {
      generations: [[{ text: "Paris" }]],
      llmOutput: {
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500
        },
        model: "gpt-4o"
      }
    },
    "run_1"
  );

  await tracker.onLLMEnd(
    {
      generations: [[{ text: "Tokyo", generationInfo: { model: "gpt-4o-mini" } }]],
      llmOutput: {
        usage: {
          input_tokens: 2000,
          output_tokens: 1000
        }
      }
    },
    "run_2"
  );

  const summary = tracker.getSummary();

  assert.equal(summary.inputTokens, 3000);
  assert.equal(summary.outputTokens, 1500);
  assert.equal(summary.totalTokens, 4500);
  assert.equal(summary.byModel["gpt-4o"].inputTokens, 1000);
  assert.equal(summary.byModel["gpt-4o-mini"].outputTokens, 1000);
  assert.equal(summary.totalCost > 0, true);
});

test("Evaluations run targets across a dataset with built-in evaluators", async () => {
  const exact = new ExactMatchEvaluator();
  const contains = new ContainsStringEvaluator();

  const exactResult = await exact.evaluate({ answer: "Paris" }, { answer: "Paris" });
  const containsResult = await contains.evaluate(
    "Paris is the capital of France.",
    "capital of france"
  );

  const summary = await runEvaluation({
    cases: [
      { id: "c1", input: "paris", expected: "PARIS" },
      { id: "c2", input: "tokyo", expected: "TOKYO" }
    ],
    target: async (input) => input.toUpperCase(),
    evaluator: exact
  });

  assert.equal(exactResult.passed, true);
  assert.equal(containsResult.passed, true);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 2);
  assert.equal(summary.failed, 0);
  assert.equal(summary.averageScore, 1);
});

test("InMemoryCheckpointStore and FileCheckpointStore persist checkpoints", async () => {
  const memoryStore = new InMemoryCheckpointStore();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-checkpoints-"));
  const fileStore = new FileCheckpointStore({ directory: tempDir });
  const checkpoint = {
    checkpointId: "cp_1",
    threadId: "thread_a",
    runId: "run_1",
    agentType: "tool-calling",
    status: "running",
    iteration: 1,
    maxIterations: 3,
    input: { input: "hello" },
    messages: [{ role: "human", content: "hello" }],
    intermediateSteps: [],
    createdAt: "2026-04-02T12:00:00.000Z",
    updatedAt: "2026-04-02T12:00:01.000Z"
  };

  try {
    await memoryStore.save(checkpoint);
    await fileStore.save(checkpoint);

    const memoryLatest = await memoryStore.getLatest("thread_a");
    const fileLatest = await fileStore.getLatest("thread_a");
    const fileList = await fileStore.list({ threadId: "thread_a" });

    assert.equal(memoryLatest.checkpointId, "cp_1");
    assert.equal(fileLatest.checkpointId, "cp_1");
    assert.equal(fileList.length, 1);

    await fileStore.delete("cp_1");
    assert.equal(await fileStore.get("cp_1"), undefined);

    await memoryStore.clear();
    await fileStore.clear();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("ToolCallingAgentExecutor resumes from a checkpoint after an interrupted run", async () => {
  class ResumableToolModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "resumable-tool-model";
      this.failedOnce = false;
    }

    _modelType() {
      return "resumable-tool-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessages = messages.filter((message) => message.role === "tool");

      if (toolMessages.length === 0) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "tool_uppercase",
              name: "uppercase",
              arguments: JSON.stringify({ input: "checkpoint" })
            }
          ]
        };
      }

      if (!this.failedOnce) {
        this.failedOnce = true;
        throw new Error("Transient provider failure");
      }

      return {
        role: "ai",
        content: `Recovered: ${toolMessages.map((message) => message.content).join(", ")}`
      };
    }
  }

  const checkpointStore = new InMemoryCheckpointStore();
  const uppercase = new DynamicTool({
    name: "uppercase",
    description: "Uppercase text",
    func: async (input) => ({ output: input.toUpperCase() })
  });

  const agent = new ToolCallingAgent(new ResumableToolModel(), [uppercase]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore,
    threadId: "resume-thread",
    returnIntermediateSteps: true
  });

  await assert.rejects(() => executor.call({ input: "resume me" }), /Transient provider failure/);

  const interrupted = await checkpointStore.getLatest("resume-thread");
  assert.equal(interrupted.status, "error");
  assert.equal(interrupted.messages.filter((message) => message.role === "tool").length, 1);

  const resumed = await executor.resume("resume-thread");
  const completed = await checkpointStore.getLatest("resume-thread");

  assert.equal(resumed.output, "Recovered: CHECKPOINT");
  assert.equal(resumed.threadId, "resume-thread");
  assert.equal(typeof resumed.checkpointId, "string");
  assert.equal(completed.status, "completed");
  assert.equal(completed.output, "Recovered: CHECKPOINT");
});

test("ToolCallingAgentExecutor can pause for human approval and resume after approval", async () => {
  class ApprovalModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "approval-model";
    }

    _modelType() {
      return "approval-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessages = messages.filter((message) => message.role === "tool");

      if (toolMessages.length === 0) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "tool_uppercase",
              name: "uppercase",
              arguments: JSON.stringify({ input: "human review" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `Approved result: ${toolMessages[0].content}`
      };
    }
  }

  const checkpointStore = new InMemoryCheckpointStore();
  const uppercase = new DynamicTool({
    name: "uppercase",
    description: "Uppercase text",
    func: async (input) => ({ output: input.toUpperCase() })
  });

  const agent = new ToolCallingAgent(new ApprovalModel(), [uppercase]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore,
    threadId: "approval-thread",
    requireApproval: ["uppercase"],
    returnIntermediateSteps: true
  });

  const paused = await executor.call({ input: "Please review this" });

  assert.equal(paused.status, "waiting_for_approval");
  assert.equal(paused.approval.status, "pending");
  assert.equal(paused.approval.action.tool, "uppercase");

  const approved = await executor.approve("approval-thread", {
    reviewer: "alice",
    reason: "Looks safe"
  });
  assert.equal(approved.approval.status, "approved");

  const resumed = await executor.resume("approval-thread");
  assert.equal(resumed.output, "Approved result: HUMAN REVIEW");
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.workflow.some((event) => event.type === "approval_requested"), true);
  assert.equal(resumed.workflow.some((event) => event.type === "approval_resolved"), true);
});

test("ToolCallingAgentExecutor can continue after a human rejects a tool call", async () => {
  class RejectionModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "rejection-model";
    }

    _modelType() {
      return "rejection-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessages = messages.filter((message) => message.role === "tool");

      if (toolMessages.length === 0) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "tool_delete",
              name: "dangerous",
              arguments: JSON.stringify({ input: "rm -rf /tmp/demo" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `Fallback after review: ${toolMessages[0].content}`
      };
    }
  }

  const checkpointStore = new InMemoryCheckpointStore();
  const dangerous = new DynamicTool({
    name: "dangerous",
    description: "Pretend dangerous tool",
    func: async () => ({ output: "should not run" })
  });

  const agent = new ToolCallingAgent(new RejectionModel(), [dangerous]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore,
    threadId: "reject-thread",
    requireApproval: true
  });

  const paused = await executor.call({ input: "Do the dangerous thing" });
  assert.equal(paused.status, "waiting_for_approval");

  const rejected = await executor.reject("reject-thread", {
    reviewer: "bob",
    reason: "Too risky"
  });
  assert.equal(rejected.approval.status, "rejected");

  const resumed = await executor.resume("reject-thread");
  assert.equal(
    resumed.output,
    'Fallback after review: Tool "dangerous" was rejected by a reviewer. Reason: Too risky'
  );
});

test("WorkflowGraph executes conditional branches and records branch history", async () => {
  const graph = new WorkflowGraph("support_triage");

  graph
    .addNode(
      "triage",
      (state) => ({
        state: {
          route: String(state.input).includes("urgent") ? "urgent" : "standard"
        }
      }),
      { start: true }
    )
    .addConditionalEdges("triage", [
      {
        to: "urgent_reply",
        label: "urgent",
        condition: (state) => state.route === "urgent"
      },
      {
        to: "standard_reply",
        label: "standard",
        condition: (state) => state.route === "standard"
      }
    ])
    .addNode("urgent_reply", () => ({ state: { reply: "Escalated immediately." } }))
    .addEdge("urgent_reply", "done")
    .addNode("standard_reply", () => ({ state: { reply: "Handled normally." } }))
    .addEdge("standard_reply", "done")
    .addNode(
      "done",
      (state) => ({
        output: {
          message: state.reply,
          route: state.route
        }
      }),
      { terminal: true }
    );

  const executor = new WorkflowExecutor(graph, {
    checkpointStore: new InMemoryWorkflowCheckpointStore()
  });

  const result = await executor.run({ input: "urgent billing issue" });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, {
    message: "Escalated immediately.",
    route: "urgent"
  });
  assert.equal(result.history[0].branch, "urgent");
  assert.equal(result.history[1].nodeId, "urgent_reply");
});

test("WorkflowExecutor can pause, resume with patched state, and persist workflow checkpoints", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-workflows-"));
  const graph = new WorkflowGraph("manual_review");

  graph
    .addNode(
      "collect",
      () => ({
        state: { reviewed: false }
      }),
      { start: true }
    )
    .addEdge("collect", "review")
    .addNode("review", (state) => {
      if (!state.reviewed) {
        return {
          pause: true,
          pauseReason: "Awaiting reviewer input",
          next: "finalize"
        };
      }

      return { next: "finalize" };
    })
    .addNode(
      "finalize",
      (state) => ({
        output: {
          approved: Boolean(state.reviewed),
          reviewerNotes: state.reviewerNotes ?? null
        }
      }),
      { terminal: true }
    );

  const store = new FileWorkflowCheckpointStore({ directory: tempDir });
  const executor = new WorkflowExecutor(graph, {
    checkpointStore: store,
    threadId: "workflow-thread"
  });

  try {
    const paused = await executor.run({ input: "Needs review" });
    assert.equal(paused.status, "paused");
    assert.equal(paused.pauseReason, "Awaiting reviewer input");
    assert.equal(paused.currentNodeId, "finalize");

    const latest = await store.getLatest("workflow-thread");
    assert.equal(latest.status, "paused");
    assert.equal(latest.currentNodeId, "finalize");

    const resumed = await executor.resume("workflow-thread", {
      reviewed: true,
      reviewerNotes: "Approved by ops"
    });

    assert.equal(resumed.status, "completed");
    assert.deepEqual(resumed.output, {
      approved: true,
      reviewerNotes: "Approved by ops"
    });
    assert.equal(resumed.history[1].status, "paused");
    assert.equal(resumed.history[1].pauseReason, "Awaiting reviewer input");
  } finally {
    await store.clear();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("WorkflowExecutor supports parallel branches with namespaced merge semantics", async () => {
  const graph = new WorkflowGraph("parallel_merge");

  graph
    .addNode(
      "fanout",
      () => ({
        parallel: [
          { nodeId: "profile", label: "profile" },
          { nodeId: "billing", label: "billing" }
        ],
        mergeStrategy: "namespaced",
        namespaceKey: "branchResults",
        next: "merge"
      }),
      { start: true }
    )
    .addNode(
      "profile",
      () => ({
        output: {
          name: "Alice",
          tier: "pro"
        }
      }),
      { terminal: true }
    )
    .addNode(
      "billing",
      () => ({
        output: {
          delinquent: false,
          currency: "USD"
        }
      }),
      { terminal: true }
    )
    .addNode(
      "merge",
      (state) => ({
        output: {
          summary: `${state.branchResults.profile.name}:${state.branchResults.billing.currency}`,
          profile: state.branchResults.profile,
          billing: state.branchResults.billing
        }
      }),
      { terminal: true }
    );

  const executor = new WorkflowExecutor(graph, {
    checkpointStore: new InMemoryWorkflowCheckpointStore()
  });

  const result = await executor.run({ input: "fetch account data" });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.state.branchResults, {
    profile: { name: "Alice", tier: "pro" },
    billing: { delinquent: false, currency: "USD" }
  });
  assert.deepEqual(result.output, {
    summary: "Alice:USD",
    profile: { name: "Alice", tier: "pro" },
    billing: { delinquent: false, currency: "USD" }
  });
  assert.equal(result.history.filter((entry) => entry.parallelGroupId).length, 2);
});

test("WorkflowExecutor can pause and resume inside a parallel branch group", async () => {
  const graph = new WorkflowGraph("parallel_pause_resume");

  graph
    .addNode(
      "fanout",
      () => ({
        parallel: [
          { nodeId: "review_branch", label: "review" },
          { nodeId: "static_branch", label: "static" }
        ],
        mergeStrategy: "namespaced",
        namespaceKey: "branches",
        next: "finalize"
      }),
      { start: true }
    )
    .addNode("review_branch", (state) => {
      if (!state.branchApproved) {
        return {
          pause: true,
          pauseReason: "Awaiting branch approval",
          next: "review_done"
        };
      }

      return { next: "review_done" };
    })
    .addNode(
      "review_done",
      () => ({
        output: {
          approved: true
        }
      }),
      { terminal: true }
    )
    .addNode(
      "static_branch",
      () => ({
        output: {
          static: "done"
        }
      }),
      { terminal: true }
    )
    .addNode(
      "finalize",
      (state) => ({
        output: {
          review: state.branches.review,
          static: state.branches.static
        }
      }),
      { terminal: true }
    );

  const store = new InMemoryWorkflowCheckpointStore();
  const executor = new WorkflowExecutor(graph, {
    checkpointStore: store,
    threadId: "parallel-thread"
  });

  const paused = await executor.run({ input: "run parallel branches" });
  assert.equal(paused.status, "paused");
  assert.equal(paused.pauseReason, "Awaiting branch approval");
  assert.equal(paused.pendingParallel.branches.some((branch) => branch.status === "paused"), true);
  assert.equal(paused.pendingParallel.branches.some((branch) => branch.status === "completed"), true);

  const resumed = await executor.resume("parallel-thread", {
    branchApproved: true
  });

  assert.equal(resumed.status, "completed");
  assert.deepEqual(resumed.output, {
    review: { approved: true },
    static: { static: "done" }
  });
});

test("Governance primitives authorize, budget, audit, and token-budget callback work", async () => {
  const authorizer = new RBACAuthorizer({
    roles: [
      {
        name: "operator",
        permissions: [
          { resourceType: "tool", action: "execute", resourceId: "calculator" }
        ]
      }
    ]
  });
  const policy = new PolicyEngine({
    rules: [
      {
        id: "block-ssh",
        effect: "deny",
        description: "SSH is blocked by policy",
        evaluate: (context) => context.resourceId === "ssh"
      }
    ]
  });
  const budgetManager = new BudgetManager({
    limits: [
      { name: "tool_calls", max: 1 },
      { name: "total_tokens", max: 100 }
    ]
  });
  const audit = new InMemoryAuditLogger();
  const handler = new GovernanceBudgetHandler({
    budgetManager,
    auditLogger: audit
  });

  const allowDecision = await authorizer.authorize({
    actor: { id: "alice", roles: ["operator"] },
    resourceType: "tool",
    resourceId: "calculator",
    action: "execute"
  });
  const denyDecision = await policy.evaluate({
    resourceType: "tool",
    resourceId: "ssh",
    action: "execute"
  });

  await handler.onLLMEnd(
    {
      generations: [[{ text: "ok" }]],
      llmOutput: {
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10
        },
        model: "gpt-4o"
      }
    },
    "run_budget"
  );

  const auditEvents = await audit.list();

  assert.equal(allowDecision.allowed, true);
  assert.equal(denyDecision.allowed, false);
  assert.equal(budgetManager.consume("tool_calls").allowed, true);
  assert.equal(budgetManager.consume("tool_calls").allowed, false);
  assert.equal(budgetManager.getUsage("total_tokens").used, 30);
  assert.equal(auditEvents.some((event) => event.type === "budget.tokens"), true);
});

test("ToolCallingAgentExecutor enforces authorization and policy checks with audit events", async () => {
  class GovernanceModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "governance-model";
    }

    _modelType() {
      return "governance-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessages = messages.filter((message) => message.role === "tool");

      if (toolMessages.length === 0) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "tool_ssh",
              name: "ssh",
              arguments: JSON.stringify({ input: "uptime" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `Observed: ${toolMessages[0].content}`
      };
    }
  }

  const audit = new InMemoryAuditLogger();
  const authorizer = new RBACAuthorizer({
    roles: [
      {
        name: "viewer",
        permissions: []
      }
    ]
  });
  const policy = new PolicyEngine({
    rules: [
      {
        id: "block-ssh",
        effect: "deny",
        description: "SSH execution is blocked",
        evaluate: (context) => context.resourceId === "ssh"
      }
    ]
  });
  const sshTool = new DynamicTool({
    name: "ssh",
    description: "Run remote commands",
    func: async () => ({ output: "should not execute" })
  });
  const agent = new ToolCallingAgent(new GovernanceModel(), [sshTool]);
  const executor = new ToolCallingAgentExecutor(agent, {
    actor: { id: "eve", roles: ["viewer"] },
    authorizer,
    policyEngine: policy,
    auditLogger: audit
  });

  const result = await executor.call({ input: "Try SSH" });
  const events = await audit.list();

  assert.equal(
    result.output,
    'Observed: Governance denied tool "ssh": Actor "eve" is not permitted to execute tool:ssh.'
  );
  assert.equal(events.some((event) => event.type === "tool.denied.authorization"), true);
});

test("WorkflowExecutor enforces workflow step budgets and records audit events", async () => {
  const graph = new WorkflowGraph("governed_workflow");

  graph
    .addNode("start", () => ({ next: "finish" }), { start: true })
    .addNode("finish", () => ({ output: { done: true } }), { terminal: true });

  const audit = new InMemoryAuditLogger();
  const budgetManager = new BudgetManager({
    limits: [{ name: "workflow_steps", max: 1 }]
  });
  const executor = new WorkflowExecutor(graph, {
    checkpointStore: new InMemoryWorkflowCheckpointStore(),
    actor: { id: "ops", roles: ["workflow_runner"] },
    budgetManager,
    auditLogger: audit
  });

  await assert.rejects(() => executor.run({ input: "hi" }), /workflow_steps/);
  const events = await audit.list();

  assert.equal(events.some((event) => event.type === "workflow.denied.budget"), true);
});

test("Monitoring snapshot loading, alert evaluation, and HTML rendering work from local artifacts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-monitoring-"));
  const auditPath = path.join(tempRoot, "audit.log");
  const checkpointDir = path.join(tempRoot, "checkpoints");
  const workflowDir = path.join(tempRoot, "workflows");

  const audit = new FileAuditLogger({ filePath: auditPath });
  await audit.record({
    id: "audit_1",
    timestamp: "2026-04-02T00:00:00.000Z",
    type: "tool.denied.budget",
    status: "warning",
    resourceType: "tool",
    resourceId: "ssh",
    message: "Budget denied SSH."
  });

  const checkpoints = new FileCheckpointStore({ directory: checkpointDir });
  await checkpoints.save({
    checkpointId: "cp_1",
    threadId: "thread_1",
    runId: "run_1",
    agentType: "tool-calling",
    status: "waiting_for_approval",
    iteration: 1,
    maxIterations: 5,
    input: { input: "hi" },
    messages: [],
    intermediateSteps: [],
    workflow: [],
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:00.000Z"
  });

  const workflows = new FileWorkflowCheckpointStore({ directory: workflowDir });
  await workflows.save({
    checkpointId: "wf_1",
    workflowId: "demo",
    threadId: "thread_1",
    runId: "run_1",
    status: "paused",
    currentNodeId: "review",
    state: { approved: false },
    history: [],
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:01.000Z"
  });

  const snapshot = await loadMonitoringSnapshot({
    auditPath,
    checkpointDir,
    workflowDir
  });
  const alerts = await new AlertManager({
    staleAfterMs: 0,
    now: () => new Date("2026-04-02T01:00:00.000Z")
  }).evaluate(snapshot);
  const html = renderMonitoringDashboardHtml(snapshot, alerts);

  assert.equal(snapshot.auditSummary.totalEvents, 1);
  assert.equal(snapshot.checkpointSummary.pendingApproval, 1);
  assert.equal(snapshot.workflowSummary.byStatus.paused, 1);
  assert.equal(alerts.some((alert) => alert.title === "Budget denials"), true);
  assert.equal(alerts.some((alert) => alert.title === "Approval backlog"), true);
  assert.equal(html.includes("Fireworks++ Monitoring Dashboard"), true);
});

test("PluginRegistry creates registered tools, loaders, workflow nodes, and callbacks", async () => {
  const registry = new PluginRegistry();
  let callbackTriggered = false;

  registry.registerManifest({
    name: "demo",
    tools: [
      {
        kind: "tool",
        name: "echo",
        create() {
          return new DynamicTool({
            name: "echo",
            description: "Echo input",
            func: async (input) => ({ output: input })
          });
        }
      }
    ],
    loaders: [
      {
        kind: "loader",
        name: "static",
        create() {
          return {
            async load() {
              return [{ pageContent: "hello", metadata: { id: "1" } }];
            }
          };
        }
      }
    ],
    workflowNodes: [
      {
        kind: "workflow_node",
        name: "finish",
        create() {
          return () => ({ output: { ok: true } });
        }
      }
    ],
    callbacks: [
      {
        kind: "callback",
        name: "marker",
        create() {
          return {
            async onToolEnd() {
              callbackTriggered = true;
            }
          };
        }
      }
    ]
  });

  const tool = registry.createTool("echo");
  const loader = registry.createLoader("static");
  const workflowNode = registry.createWorkflowNode("finish");
  const callback = registry.createCallback("marker");
  const loadResult = await loader.load();
  const toolResult = await tool.run("ok", [callback]);
  const nodeResult = await workflowNode({}, {
    workflowId: "wf",
    checkpointId: "cp",
    threadId: "thread",
    runId: "run",
    nodeId: "finish",
    checkpoint: {
      checkpointId: "cp",
      workflowId: "wf",
      threadId: "thread",
      runId: "run",
      status: "running",
      state: {},
      history: [],
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z"
    },
    history: []
  });

  assert.equal(toolResult, "ok");
  assert.equal(loadResult[0].pageContent, "hello");
  assert.equal(nodeResult.output.ok, true);
  assert.equal(callbackTriggered, true);
  assert.deepEqual(registry.list(), {
    tools: ["echo"],
    loaders: ["static"],
    workflowNodes: ["finish"],
    callbacks: ["marker"]
  });
});

test("Connectors dispatch audit and alert payloads over HTTP transports", async () => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async text() {
        return "";
      }
    };
  };

  try {
    const dispatcher = new ConnectorDispatcher({
      connectors: [
        new WebhookConnector({ url: "https://example.com/webhook" }),
        new RestConnector({ url: "https://example.com/rest" }),
        new SplunkHECConnector({ url: "https://example.com/splunk", token: "token" }),
        new KafkaRestConnector({ url: "https://example.com/kafka", topic: "agent-events" })
      ]
    });

    await dispatcher.dispatchAudit({
      id: "audit_1",
      timestamp: "2026-04-02T00:00:00.000Z",
      type: "agent.run.completed",
      status: "success",
      message: "done"
    });

    assert.equal(requests.length, 4);
    assert.match(requests[0].url, /webhook/);
    assert.match(requests[2].options.headers.Authorization, /Splunk token/);
    assert.match(requests[3].url, /agent-events/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ScopedBudgetManager enforces scoped team budgets", async () => {
  const budgets = new ScopedBudgetManager({
    limits: [{ name: "total_tokens", max: 100 }],
    scopedLimits: [{ scope: "team:alpha", name: "tool_calls", max: 1 }]
  });

  assert.equal(budgets.consume("total_tokens", 10).allowed, true);
  assert.equal(budgets.consumeScoped("team:alpha", "tool_calls", 1).allowed, true);
  assert.equal(budgets.consumeScoped("team:alpha", "tool_calls", 1).allowed, false);
  assert.equal(budgets.getUsageForScope("team:alpha", "tool_calls").used, 1);
});

test("ChatGemini supports generation, tool calling, and structured output", async () => {
  const originalFetch = global.fetch;
  const bodies = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);

    if (body.generationConfig?.responseMimeType === "application/json") {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify({ answer: "Paris" }) }]
                }
              }
            ]
          };
        }
      };
    }

    if (body.tools) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: "get_weather", args: { city: "Tokyo" } } }]
                }
              }
            ]
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini" }]
              },
              finishReason: "STOP"
            }
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3
          }
        };
      }
    };
  };

  try {
    const gemini = new ChatGemini({ apiKey: "test-key" });
    const reply = await gemini.call([{ role: "human", content: "Hello" }]);
    const toolReply = await gemini.callWithTools(
      [{ role: "human", content: "Weather?" }],
      [
        {
          name: "get_weather",
          description: "Get weather",
          parameters: { type: "object", properties: { city: { type: "string" } } }
        }
      ]
    );
    const structured = await gemini.generateStructured(
      [{ role: "human", content: "Capital?" }],
      { name: "capital_answer", schema: { type: "object", properties: { answer: { type: "string" } } } }
    );

    assert.equal(reply.content, "Hello from Gemini");
    assert.equal(toolReply.toolCalls[0].name, "get_weather");
    assert.deepEqual(structured, { answer: "Paris" });
    assert.equal(bodies.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test("MCPServer and MCPClient support tools, resources, and prompts", async () => {
  const server = new MCPServer({
    tools: [
      new DynamicTool({
        name: "echo",
        description: "Echo input",
        func: async (input) => ({ output: `echo:${input}` })
      })
    ],
    resources: [
      {
        uri: "file:///demo.txt",
        name: "demo",
        mimeType: "text/plain",
        read() {
          return { uri: "file:///demo.txt", mimeType: "text/plain", text: "demo resource" };
        }
      }
    ],
    prompts: [
      {
        name: "review",
        description: "Review text",
        arguments: [{ name: "topic", required: true }],
        get(arguments_) {
          return {
            description: "Review prompt",
            messages: [
              {
                role: "user",
                content: { type: "text", text: `Review ${arguments_.topic}` }
              }
            ]
          };
        }
      }
    ]
  });

  const client = new MCPClient({
    transport: new InMemoryMCPTransport((message) => server.handleMessage(message))
  });

  const init = await client.initialize();
  const tools = await client.listTools();
  const callResult = await client.callTool("echo", { input: "hi" });
  const resources = await client.listResources();
  const contents = await client.readResource("file:///demo.txt");
  const prompts = await client.listPrompts();
  const prompt = await client.getPrompt("review", { topic: "the code" });
  const remoteTools = await client.asTools();
  const remoteToolResult = await remoteTools[0].run("hello");

  assert.equal(init.serverInfo.name, "fireworks-plus-plus-mcp");
  assert.equal(tools[0].name, "echo");
  assert.equal(callResult.content[0].text, "echo:hi");
  assert.equal(resources[0].uri, "file:///demo.txt");
  assert.equal(contents[0].text, "demo resource");
  assert.equal(prompts[0].name, "review");
  assert.match(prompt.messages[0].content.text, /Review the code/);
  assert.equal(remoteToolResult, "echo:hello");
});

test("package exports the MCP subpath", async () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const mod = await import('fireworks-plus-plus/mcp'); console.log(Boolean(mod.MCPClient) && Boolean(mod.MCPServer));"
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  ).trim();

  assert.equal(output, "true");
});

test("HS256Authenticator and ManagementServer protect dashboard endpoints", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-server-"));
  const auditPath = path.join(tempRoot, "audit.log");
  const checkpointDir = path.join(tempRoot, "checkpoints");
  const workflowDir = path.join(tempRoot, "workflows");
  const audit = new FileAuditLogger({ filePath: auditPath });
  await audit.record({
    id: "audit_1",
    timestamp: "2026-04-02T00:00:00.000Z",
    type: "agent.run.started",
    status: "info",
    message: "started"
  });

  const authenticator = new HS256Authenticator({
    secret: "top-secret",
    issuer: "fireworks-plus-plus",
    audience: "dashboard"
  });
  const token = HS256Authenticator.sign(
    {
      sub: "alice",
      roles: ["admin"],
      iss: "fireworks-plus-plus",
      aud: "dashboard",
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    "top-secret"
  );

  const server = new ManagementServer({
    auditPath,
    checkpointDir,
    workflowDir,
    authenticator
  });

  assert.equal(await server.authenticateHeaders({}), false);
  assert.equal(
    await server.authenticateHeaders({
      authorization: `Bearer ${token}`
    }),
    true
  );

  const payload = await server.getDashboardPayload();
  const htmlText = await server.renderDashboard();

  assert.equal(payload.snapshot.auditSummary.totalEvents, 1);
  assert.match(htmlText, /Monitoring Dashboard/);
});

test("createAgent provides a simple ask() flow with object-style tools", async () => {
  class SimpleModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "simple-model";
    }

    _modelType() {
      return "simple-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessage = messages.find((message) => message.role === "tool");
      if (!toolMessage) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "call_weather",
              name: "weather",
              arguments: JSON.stringify({ input: "Tokyo" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `Answer: ${toolMessage.content}`
      };
    }
  }

  const agent = createAgent({
    chatModel: new SimpleModel(),
    tools: {
      weather: async (input) => `Sunny in ${input}`
    }
  });

  const result = await agent.ask("Weather in Tokyo?");

  assert.equal(result.text, "Answer: Sunny in Tokyo");
  assert.equal(result.status, "completed");
});

test("createAgent supports use(), enableGovernance(), alerts(), and dashboard()", async () => {
  class GovernanceSimpleModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "governed-simple-model";
    }

    _modelType() {
      return "governed-simple-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessage = messages.find((message) => message.role === "tool");
      if (!toolMessage) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "call_ssh",
              name: "ssh",
              arguments: JSON.stringify({ input: "uptime" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `Observed: ${toolMessage.content}`
      };
    }
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-simple-"));
  const agent = createAgent({
    chatModel: new GovernanceSimpleModel(),
    monitoring: { rootDir: tempRoot }
  });

  agent.use("ssh", async () => "should not execute");
  agent.enableGovernance({
    actor: { id: "eve", roles: ["viewer"] },
    roles: [{ name: "viewer", permissions: [] }]
  });

  const result = await agent.ask("Try ssh");
  const alerts = await agent.alerts();
  const html = await agent.dashboard({ html: true });

  assert.match(result.text, /Governance denied tool "ssh"/);
  assert.equal(Array.isArray(alerts), true);
  assert.match(html, /Monitoring Dashboard/);
});

test("createAgent can pause for approval and surface backlog alerts", async () => {
  class ApprovalModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "approval-model";
    }

    _modelType() {
      return "approval-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools() {
      return {
        role: "ai",
        content: "",
        toolCalls: [
          {
            id: "call_deploy",
            name: "deploy",
            arguments: JSON.stringify({ input: "release-1" })
          }
        ]
      };
    }
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-approval-"));
  const agent = createAgent({
    chatModel: new ApprovalModel(),
    monitoring: { rootDir: tempRoot },
    governance: {
      requireApproval: true
    },
    tools: {
      deploy: async () => "started"
    }
  });

  const result = await agent.ask("Deploy now");
  const alerts = await agent.alerts();

  assert.equal(result.status, "waiting_for_approval");
  assert.equal(alerts.some((alert) => alert.title === "Approval backlog"), true);
});

test("createAgent can instantiate a provider-backed model through the simple facade", async () => {
  const originalFetch = global.fetch;

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[0].text, "Hello from simple facade");

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "Hello from Gemini facade" }]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const agent = createAgent({
      provider: "gemini",
      apiKey: "test-key"
    });
    const result = await agent.ask("Hello from simple facade");

    assert.equal(result.text, "Hello from Gemini facade");
  } finally {
    global.fetch = originalFetch;
  }
});

test("createAgent can import MCP tools through useMCP()", async () => {
  class MCPModel extends BaseChatModel {
    constructor() {
      super();
      this.modelName = "mcp-model";
    }

    _modelType() {
      return "mcp-model";
    }

    async generate() {
      throw new Error("Not used in this test");
    }

    async callWithTools(messages) {
      const toolMessage = messages.find((message) => message.role === "tool");
      if (!toolMessage) {
        return {
          role: "ai",
          content: "",
          toolCalls: [
            {
              id: "call_echo",
              name: "echo",
              arguments: JSON.stringify({ input: "hello" })
            }
          ]
        };
      }

      return {
        role: "ai",
        content: `MCP observed: ${toolMessage.content}`
      };
    }
  }

  const server = new MCPServer({
    tools: [
      new DynamicTool({
        name: "echo",
        description: "Echo input",
        func: async (input) => ({ output: `echo:${input}` })
      })
    ]
  });
  const client = new MCPClient({
    transport: new InMemoryMCPTransport((message) => server.handleMessage(message))
  });
  await client.initialize();

  const agent = createAgent({
    chatModel: new MCPModel()
  });
  await agent.useMCP(client);
  const result = await agent.ask("Use MCP");

  assert.equal(result.text, "MCP observed: echo:hello");
});

test("CLI scaffolds projects and inspects audit, checkpoint, and workflow artifacts", async () => {
  const cliPath = path.join(process.cwd(), "dist", "cli.js");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-cli-"));
  const appDir = path.join(tempRoot, "demo-app");
  const auditPath = path.join(tempRoot, "audit.log");
  const checkpointDir = path.join(tempRoot, "checkpoints");
  const workflowDir = path.join(tempRoot, "workflows");
  await fs.writeFile(
    path.join(tempRoot, "fireworks.config.json"),
    JSON.stringify(
      {
        auditPath,
        checkpointDir,
        workflowDir
      },
      null,
      2
    ),
    "utf8"
  );

  execFileSync(process.execPath, [cliPath, "init", appDir, "--provider", "openai"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const scaffoldedPackage = JSON.parse(
    await fs.readFile(path.join(appDir, "package.json"), "utf8")
  );
  const scaffoldedAgent = await fs.readFile(path.join(appDir, "src", "agent.ts"), "utf8");

  assert.equal(scaffoldedPackage.dependencies.openai, "^4.104.0");
  assert.match(scaffoldedAgent, /ToolCallingAgentExecutor/);

  const audit = new FileAuditLogger({ filePath: auditPath });
  await audit.record({
    id: "audit_1",
    timestamp: "2026-04-02T00:00:00.000Z",
    type: "tool.executed",
    status: "success",
    resourceType: "tool",
    resourceId: "calculator",
    message: "Executed calculator."
  });

  const checkpoints = new FileCheckpointStore({ directory: checkpointDir });
  await checkpoints.save({
    checkpointId: "cp_1",
    threadId: "thread_1",
    runId: "run_1",
    agentType: "tool-calling",
    status: "waiting_for_approval",
    iteration: 1,
    maxIterations: 5,
    input: { input: "hi" },
    messages: [],
    intermediateSteps: [],
    approval: {
      toolCall: { id: "call_1", name: "ssh", arguments: JSON.stringify({ command: "uptime" }) },
      action: { tool: "ssh", toolInput: "uptime", log: "ssh" },
      status: "pending",
      requestedAt: "2026-04-02T00:00:00.000Z"
    },
    workflow: [],
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:01.000Z"
  });

  const workflows = new FileWorkflowCheckpointStore({ directory: workflowDir });
  await workflows.save({
    checkpointId: "wf_1",
    workflowId: "demo",
    threadId: "thread_1",
    runId: "run_1",
    status: "paused",
    currentNodeId: "review",
    state: { approved: false },
    history: [],
    pendingParallel: {
      groupId: "group_1",
      sourceNodeId: "fanout",
      mergeStrategy: "namespaced",
      branches: [],
      startedAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:01.000Z"
    },
    createdAt: "2026-04-02T00:00:00.000Z",
    updatedAt: "2026-04-02T00:00:01.000Z"
  });

  const auditReport = JSON.parse(
    execFileSync(process.execPath, [cliPath, "inspect", "audit", auditPath, "--json"], {
      cwd: tempRoot,
      encoding: "utf8"
    })
  );
  const checkpointReport = JSON.parse(
    execFileSync(process.execPath, [cliPath, "inspect", "checkpoints", checkpointDir, "--json"], {
      cwd: tempRoot,
      encoding: "utf8"
    })
  );
  const workflowReport = JSON.parse(
    execFileSync(process.execPath, [cliPath, "inspect", "workflows", workflowDir, "--json"], {
      cwd: tempRoot,
      encoding: "utf8"
    })
  );
  const alertsReport = JSON.parse(
    execFileSync(process.execPath, [cliPath, "alerts", "--json"], {
      cwd: tempRoot,
      encoding: "utf8"
    })
  );
  const dashboardReport = JSON.parse(
    execFileSync(process.execPath, [cliPath, "dashboard", "--json"], {
      cwd: tempRoot,
      encoding: "utf8"
    })
  );
  const dashboardPath = path.join(tempRoot, "dashboard.html");

  execFileSync(process.execPath, [cliPath, "dashboard", "--html", dashboardPath], {
    cwd: tempRoot,
    encoding: "utf8"
  });
  const dashboardHtml = await fs.readFile(dashboardPath, "utf8");

  assert.equal(auditReport.summary.totalEvents, 1);
  assert.equal(auditReport.summary.byType["tool.executed"], 1);
  assert.equal(checkpointReport.summary.pendingApproval, 1);
  assert.equal(checkpointReport.summary.byStatus.waiting_for_approval, 1);
  assert.equal(workflowReport.summary.pendingParallel, 1);
  assert.equal(workflowReport.summary.byStatus.paused, 1);
  assert.equal(Array.isArray(alertsReport.alerts), true);
  assert.equal(dashboardReport.snapshot.auditSummary.totalEvents, 1);
  assert.match(dashboardHtml, /Monitoring Dashboard/);
});
