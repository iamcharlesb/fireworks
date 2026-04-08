import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  AlertManager,
  FileAuditLogger,
  FileCheckpointStore,
  FileWorkflowCheckpointStore,
  loadMonitoringSnapshot,
  renderMonitoringDashboardHtml
} from "../src";

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fireworks-plus-plus-monitoring-"));
  const auditPath = path.join(root, "audit.log");
  const checkpointDir = path.join(root, "checkpoints");
  const workflowDir = path.join(root, "workflows");

  const audit = new FileAuditLogger({ filePath: auditPath });
  await audit.record({
    id: "audit_1",
    timestamp: new Date().toISOString(),
    type: "tool.denied.budget",
    status: "warning",
    resourceType: "tool",
    resourceId: "ssh",
    message: 'Governance denied tool "ssh" because of budget limits.'
  });

  const checkpoints = new FileCheckpointStore({ directory: checkpointDir });
  await checkpoints.save({
    checkpointId: "cp_1",
    threadId: "thread_1",
    runId: "run_1",
    agentType: "tool-calling",
    status: "waiting_for_approval",
    iteration: 2,
    maxIterations: 5,
    input: { input: "Run a risky tool" },
    messages: [],
    intermediateSteps: [],
    workflow: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  });

  const workflows = new FileWorkflowCheckpointStore({ directory: workflowDir });
  await workflows.save({
    checkpointId: "wf_1",
    workflowId: "approval_flow",
    threadId: "thread_1",
    runId: "run_1",
    status: "paused",
    currentNodeId: "review",
    state: { approved: false },
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const snapshot = await loadMonitoringSnapshot({
    auditPath,
    checkpointDir,
    workflowDir
  });
  const alerts = await new AlertManager().evaluate(snapshot);
  const html = renderMonitoringDashboardHtml(snapshot, alerts);
  const dashboardPath = path.join(root, "dashboard.html");

  await fs.writeFile(dashboardPath, html, "utf8");

  console.log("Snapshot summary:", {
    auditEvents: snapshot.auditSummary.totalEvents,
    agentCheckpoints: snapshot.checkpointSummary.totalCheckpoints,
    workflowCheckpoints: snapshot.workflowSummary.totalWorkflows,
    alerts: alerts.map((alert) => `${alert.severity}:${alert.title}`)
  });
  console.log("Dashboard written to:", dashboardPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
