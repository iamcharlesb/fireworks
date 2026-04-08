#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { AlertManager, loadMonitoringSnapshot, renderMonitoringDashboardHtml } from "./monitoring";
import { ManagementServer } from "./server";

type InspectTarget = "audit" | "checkpoints" | "workflows";
type Provider = "anthropic" | "openai";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

interface FireworksConfig {
  provider?: Provider;
  auditPath?: string;
  checkpointDir?: string;
  workflowDir?: string;
}

interface AuditEventRecord {
  id?: string;
  timestamp?: string;
  type?: string;
  status?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface AgentCheckpointRecord {
  checkpointId?: string;
  threadId?: string;
  status?: string;
  updatedAt?: string;
  approval?: { status?: string };
}

interface WorkflowCheckpointRecord {
  checkpointId?: string;
  threadId?: string;
  status?: string;
  updatedAt?: string;
  pendingParallel?: { groupId?: string };
}

function usage(): string {
  return [
    "Fireworks++ CLI",
    "",
    "Usage:",
    "  fireworks-plus-plus init [directory] [--provider anthropic|openai] [--force]",
    "  fireworks-plus-plus doctor",
    "  fireworks-plus-plus inspect audit [file] [--json]",
    "  fireworks-plus-plus inspect checkpoints [directory] [--json]",
    "  fireworks-plus-plus inspect workflows [directory] [--json]",
    "  fireworks-plus-plus dashboard [--json] [--html output.html]",
    "  fireworks-plus-plus alerts [--json]",
    "  fireworks-plus-plus serve [--host 127.0.0.1] [--port 3000]",
    "",
    "Examples:",
    "  fireworks-plus-plus init ./my-agent --provider anthropic",
    "  fireworks-plus-plus doctor",
    "  fireworks-plus-plus inspect audit .fireworks-plus-plus/audit.log",
    "  fireworks-plus-plus inspect checkpoints .fireworks-plus-plus/checkpoints --json",
    "  fireworks-plus-plus dashboard --html .fireworks-plus-plus/dashboard.html",
    "  fireworks-plus-plus alerts --json",
    "  fireworks-plus-plus serve --port 3000"
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      positionals.push(part);
      continue;
    }

    const [rawKey, inlineValue] = part.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags.set(rawKey, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawKey, next);
      index += 1;
      continue;
    }

    flags.set(rawKey, true);
  }

  return { positionals, flags };
}

function getFlagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true || typeof args.flags.get(name) === "string";
}

function formatKeyValue(key: string, value: string | number | boolean | undefined): string {
  return `${key}: ${value ?? "n/a"}`;
}

function collectCounts(values: Array<string | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion(): Promise<string> {
  try {
    const packageJsonPath = path.resolve(__dirname, "..", "package.json");
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function readConfig(cwd: string): Promise<FireworksConfig> {
  const configPath = path.join(cwd, "fireworks.config.json");
  if (!(await exists(configPath))) {
    return {};
  }

  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as FireworksConfig;
}

async function ensureWritableTarget(directory: string, force: boolean): Promise<void> {
  if (!(await exists(directory))) {
    return;
  }

  const entries = await fs.readdir(directory);
  if (entries.length > 0 && !force) {
    throw new Error(`Refusing to scaffold into non-empty directory: ${directory}. Use --force to overwrite.`);
  }
}

function renderPackageJson(projectName: string, provider: Provider): string {
  const dependencies: Record<string, string> = {
    "fireworks-plus-plus": "^0.1.0"
  };

  if (provider === "anthropic") {
    dependencies["@anthropic-ai/sdk"] = "^0.58.0";
  } else {
    dependencies["openai"] = "^4.104.0";
  }

  const pkg = {
    name: projectName,
    private: true,
    scripts: {
      dev: "tsx src/agent.ts",
      build: "tsc",
      start: "node dist/agent.js"
    },
    dependencies,
    devDependencies: {
      "@types/node": "^22.0.0",
      tsx: "^4.19.0",
      typescript: "^5.8.2"
    }
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function renderTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "node",
        strict: true,
        esModuleInterop: true,
        outDir: "dist",
        rootDir: "src"
      },
      include: ["src/**/*"]
    },
    null,
    2
  )}\n`;
}

function renderConfig(provider: Provider): string {
  return `${JSON.stringify(
    {
      provider,
      auditPath: ".fireworks-plus-plus/audit.log",
      checkpointDir: ".fireworks-plus-plus/checkpoints",
      workflowDir: ".fireworks-plus-plus/workflows"
    },
    null,
    2
  )}\n`;
}

function renderEnvExample(provider: Provider): string {
  return provider === "anthropic"
    ? "ANTHROPIC_API_KEY=your-key\n"
    : "OPENAI_API_KEY=your-key\n";
}

function renderGitignore(): string {
  return "node_modules\n.env\ndist\n.fireworks-plus-plus\n";
}

function renderAgentTemplate(provider: Provider): string {
  const modelClass = provider === "anthropic" ? "ChatAnthropic" : "ChatOpenAI";
  const envName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";

  return `import {
  BudgetManager,
  CalculatorTool,
  ${modelClass},
  CostTrackingHandler,
  FileAuditLogger,
  FileCheckpointStore,
  GovernanceBudgetHandler,
  ToolCallingAgent,
  ToolCallingAgentExecutor,
  TracingCallbackHandler
} from "fireworks-plus-plus";

async function main(): Promise<void> {
  const tracing = new TracingCallbackHandler();
  const costing = new CostTrackingHandler();
  const budgets = new BudgetManager({
    limits: [{ name: "total_tokens", max: 50000 }]
  });
  const audit = new FileAuditLogger();

  const llm = new ${modelClass}({
    apiKey: process.env.${envName},
    callbacks: [
      tracing,
      costing,
      new GovernanceBudgetHandler({
        budgetManager: budgets,
        auditLogger: audit
      })
    ]
  });

  const agent = new ToolCallingAgent(llm, [new CalculatorTool()]);
  const executor = new ToolCallingAgentExecutor(agent, {
    checkpointStore: new FileCheckpointStore(),
    auditLogger: audit,
    budgetManager: budgets
  });

  const result = await executor.call({
    input: "Use the calculator tool to compute (17 * 9) + 24."
  });

  console.log("Output:", result.output);
  console.log("Trace summary:", tracing.getSummary());
  console.log("Budget usage:", budgets.getAllUsage());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function handleInit(args: ParsedArgs): Promise<void> {
  const targetDirectory = path.resolve(args.positionals[1] ?? ".");
  const provider = (getFlagString(args, "provider") ?? "anthropic") as Provider;
  const force = hasFlag(args, "force");

  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`Unsupported provider "${provider}". Use "anthropic" or "openai".`);
  }

  await ensureWritableTarget(targetDirectory, force);
  await fs.mkdir(targetDirectory, { recursive: true });

  const projectName = path.basename(targetDirectory);
  await writeTextFile(path.join(targetDirectory, "package.json"), renderPackageJson(projectName, provider));
  await writeTextFile(path.join(targetDirectory, "tsconfig.json"), renderTsconfig());
  await writeTextFile(path.join(targetDirectory, "fireworks.config.json"), renderConfig(provider));
  await writeTextFile(path.join(targetDirectory, ".env.example"), renderEnvExample(provider));
  await writeTextFile(path.join(targetDirectory, ".gitignore"), renderGitignore());
  await writeTextFile(path.join(targetDirectory, "src", "agent.ts"), renderAgentTemplate(provider));

  console.log(`Scaffolded Fireworks++ app in ${targetDirectory}`);
  console.log("Next steps:");
  console.log("  1. npm install");
  console.log("  2. copy .env.example to .env and add your API key");
  console.log("  3. npm run dev");
}

async function handleDoctor(cwd: string): Promise<void> {
  const version = await readPackageVersion();
  const config = await readConfig(cwd);
  const auditPath = path.resolve(cwd, config.auditPath ?? ".fireworks-plus-plus/audit.log");
  const checkpointDir = path.resolve(cwd, config.checkpointDir ?? ".fireworks-plus-plus/checkpoints");
  const workflowDir = path.resolve(cwd, config.workflowDir ?? ".fireworks-plus-plus/workflows");

  console.log(formatKeyValue("fireworks_plus_plus_version", version));
  console.log(formatKeyValue("node_version", process.version));
  console.log(formatKeyValue("cwd", cwd));
  console.log(formatKeyValue("config_present", await exists(path.join(cwd, "fireworks.config.json"))));
  console.log(formatKeyValue("provider", config.provider));
  console.log(formatKeyValue("anthropic_key", Boolean(process.env.ANTHROPIC_API_KEY)));
  console.log(formatKeyValue("openai_key", Boolean(process.env.OPENAI_API_KEY)));
  console.log(formatKeyValue("audit_log", await exists(auditPath)));
  console.log(formatKeyValue("checkpoint_dir", await exists(checkpointDir)));
  console.log(formatKeyValue("workflow_dir", await exists(workflowDir)));
}

function resolveArtifactPaths(cwd: string, config: FireworksConfig): {
  auditPath: string;
  checkpointDir: string;
  workflowDir: string;
} {
  return {
    auditPath: path.resolve(cwd, config.auditPath ?? ".fireworks-plus-plus/audit.log"),
    checkpointDir: path.resolve(cwd, config.checkpointDir ?? ".fireworks-plus-plus/checkpoints"),
    workflowDir: path.resolve(cwd, config.workflowDir ?? ".fireworks-plus-plus/workflows")
  };
}

async function readAuditEvents(filePath: string): Promise<AuditEventRecord[]> {
  if (!(await exists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEventRecord);
}

async function readJsonDirectory<T>(directory: string): Promise<T[]> {
  if (!(await exists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const items: T[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(directory, entry.name), "utf8");
    items.push(JSON.parse(raw) as T);
  }

  return items;
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function inspectAudit(filePath: string, asJson: boolean): Promise<void> {
  const events = await readAuditEvents(filePath);
  const ordered = [...events].sort((a, b) =>
    String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""))
  );

  const summary = {
    totalEvents: ordered.length,
    byType: collectCounts(ordered.map((event) => event.type)),
    byStatus: collectCounts(ordered.map((event) => event.status)),
    latestTimestamp: ordered[0]?.timestamp
  };

  if (asJson) {
    printJson({ summary, events: ordered });
    return;
  }

  console.log(`Audit log: ${filePath}`);
  console.log(formatKeyValue("total_events", summary.totalEvents));
  console.log(formatKeyValue("latest_timestamp", summary.latestTimestamp));
  console.log(`by_status: ${JSON.stringify(summary.byStatus)}`);
  console.log(`by_type: ${JSON.stringify(summary.byType)}`);

  for (const event of ordered.slice(0, 5)) {
    console.log(
      `- [${event.timestamp ?? "unknown"}] ${event.type ?? "unknown"} ${event.status ?? "unknown"}: ${event.message ?? ""}`
    );
  }
}

async function inspectCheckpoints(directory: string, asJson: boolean): Promise<void> {
  const checkpoints = await readJsonDirectory<AgentCheckpointRecord>(directory);
  const ordered = [...checkpoints].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
  );

  const summary = {
    totalCheckpoints: ordered.length,
    byStatus: collectCounts(ordered.map((checkpoint) => checkpoint.status)),
    pendingApproval: ordered.filter((checkpoint) => checkpoint.status === "waiting_for_approval").length,
    latestUpdatedAt: ordered[0]?.updatedAt
  };

  if (asJson) {
    printJson({ summary, checkpoints: ordered });
    return;
  }

  console.log(`Checkpoint directory: ${directory}`);
  console.log(formatKeyValue("total_checkpoints", summary.totalCheckpoints));
  console.log(formatKeyValue("latest_updated_at", summary.latestUpdatedAt));
  console.log(formatKeyValue("pending_approval", summary.pendingApproval));
  console.log(`by_status: ${JSON.stringify(summary.byStatus)}`);

  for (const checkpoint of ordered.slice(0, 5)) {
    console.log(
      `- ${checkpoint.checkpointId ?? "unknown"} ${checkpoint.status ?? "unknown"} thread=${checkpoint.threadId ?? "unknown"}`
    );
  }
}

async function inspectWorkflows(directory: string, asJson: boolean): Promise<void> {
  const workflows = await readJsonDirectory<WorkflowCheckpointRecord>(directory);
  const ordered = [...workflows].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
  );

  const summary = {
    totalWorkflows: ordered.length,
    byStatus: collectCounts(ordered.map((checkpoint) => checkpoint.status)),
    pendingParallel: ordered.filter((checkpoint) => Boolean(checkpoint.pendingParallel)).length,
    latestUpdatedAt: ordered[0]?.updatedAt
  };

  if (asJson) {
    printJson({ summary, workflows: ordered });
    return;
  }

  console.log(`Workflow directory: ${directory}`);
  console.log(formatKeyValue("total_workflows", summary.totalWorkflows));
  console.log(formatKeyValue("latest_updated_at", summary.latestUpdatedAt));
  console.log(formatKeyValue("pending_parallel", summary.pendingParallel));
  console.log(`by_status: ${JSON.stringify(summary.byStatus)}`);

  for (const checkpoint of ordered.slice(0, 5)) {
    console.log(
      `- ${checkpoint.checkpointId ?? "unknown"} ${checkpoint.status ?? "unknown"} thread=${checkpoint.threadId ?? "unknown"}`
    );
  }
}

async function handleInspect(args: ParsedArgs, cwd: string): Promise<void> {
  const target = args.positionals[1] as InspectTarget | undefined;
  const config = await readConfig(cwd);
  const asJson = hasFlag(args, "json");
  const paths = resolveArtifactPaths(cwd, config);

  if (!target) {
    throw new Error("Missing inspect target. Use audit, checkpoints, or workflows.");
  }

  if (target === "audit") {
    const filePath = path.resolve(cwd, args.positionals[2] ?? paths.auditPath);
    await inspectAudit(filePath, asJson);
    return;
  }

  if (target === "checkpoints") {
    const directory = path.resolve(cwd, args.positionals[2] ?? paths.checkpointDir);
    await inspectCheckpoints(directory, asJson);
    return;
  }

  if (target === "workflows") {
    const directory = path.resolve(cwd, args.positionals[2] ?? paths.workflowDir);
    await inspectWorkflows(directory, asJson);
    return;
  }

  throw new Error(`Unsupported inspect target "${target}".`);
}

async function handleDashboard(args: ParsedArgs, cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  const paths = resolveArtifactPaths(cwd, config);
  const snapshot = await loadMonitoringSnapshot(paths);
  const alerts = await new AlertManager().evaluate(snapshot);
  const outputHtmlPath = getFlagString(args, "html");

  if (outputHtmlPath) {
    const filePath = path.resolve(cwd, outputHtmlPath);
    await writeTextFile(filePath, renderMonitoringDashboardHtml(snapshot, alerts));
    console.log(`Wrote monitoring dashboard to ${filePath}`);
    return;
  }

  if (hasFlag(args, "json")) {
    printJson({ snapshot, alerts });
    return;
  }

  console.log("Fireworks++ Monitoring");
  console.log(formatKeyValue("generated_at", snapshot.generatedAt));
  console.log(formatKeyValue("audit_events", snapshot.auditSummary.totalEvents));
  console.log(formatKeyValue("agent_checkpoints", snapshot.checkpointSummary.totalCheckpoints));
  console.log(formatKeyValue("workflow_checkpoints", snapshot.workflowSummary.totalWorkflows));
  console.log(formatKeyValue("active_alerts", alerts.length));

  for (const alert of alerts.slice(0, 5)) {
    console.log(`- [${alert.severity}] ${alert.title}: ${alert.message}`);
  }
}

async function handleAlerts(args: ParsedArgs, cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  const snapshot = await loadMonitoringSnapshot(resolveArtifactPaths(cwd, config));
  const alerts = await new AlertManager().evaluate(snapshot);

  if (hasFlag(args, "json")) {
    printJson({ alerts });
    return;
  }

  if (alerts.length === 0) {
    console.log("No active alerts.");
    return;
  }

  for (const alert of alerts) {
    console.log(`[${alert.severity}] ${alert.title}: ${alert.message}`);
  }
}

async function handleServe(args: ParsedArgs, cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  const paths = resolveArtifactPaths(cwd, config);
  const host = getFlagString(args, "host") ?? "127.0.0.1";
  const port = Number(getFlagString(args, "port") ?? 3000);
  const server = new ManagementServer({
    host,
    port,
    ...paths
  });
  const details = await server.start();

  console.log(`Fireworks++ management server listening on ${details.url}`);
  console.log("Press Ctrl+C to stop.");

  const stop = async () => {
    await server.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    stop().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    stop().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
  });

  await new Promise<void>(() => {
    // Keep process alive until signal.
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positionals[0];
  const cwd = process.cwd();

  if (!command || command === "help" || hasFlag(args, "help")) {
    console.log(usage());
    return;
  }

  if (command === "doctor") {
    await handleDoctor(cwd);
    return;
  }

  if (command === "init") {
    await handleInit(args);
    return;
  }

  if (command === "inspect") {
    await handleInspect(args, cwd);
    return;
  }

  if (command === "dashboard") {
    await handleDashboard(args, cwd);
    return;
  }

  if (command === "alerts") {
    await handleAlerts(args, cwd);
    return;
  }

  if (command === "serve") {
    await handleServe(args, cwd);
    return;
  }

  if (command === "version" || hasFlag(args, "version")) {
    console.log(await readPackageVersion());
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
