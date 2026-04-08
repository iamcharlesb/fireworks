import { promises as fs } from "fs";
import path from "path";
import type { AgentCheckpoint } from "../checkpoints";
import type { AuditEvent } from "../governance";
import type { WorkflowCheckpoint } from "../workflows";
import type { LocalArtifactPaths, MonitoringAlert, MonitoringSnapshot } from "./base";

export interface MonitoringSnapshotOptions {
  recentLimit?: number;
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

async function readAuditEvents(filePath?: string): Promise<AuditEvent[]> {
  if (!filePath || !(await exists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEvent)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function readJsonDirectory<T>(directory?: string): Promise<T[]> {
  if (!directory || !(await exists(directory))) {
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

function sortByTimestampDesc<T>(
  items: T[],
  selector: (value: T) => string | undefined
): T[] {
  return [...items].sort((a, b) => String(selector(b) ?? "").localeCompare(String(selector(a) ?? "")));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function loadMonitoringSnapshot(
  paths: LocalArtifactPaths,
  options: MonitoringSnapshotOptions = {}
): Promise<MonitoringSnapshot> {
  const recentLimit = options.recentLimit ?? 5;
  const auditEvents = await readAuditEvents(paths.auditPath);
  const checkpoints = sortByTimestampDesc(
    await readJsonDirectory<AgentCheckpoint>(paths.checkpointDir),
    (checkpoint) => checkpoint.updatedAt
  );
  const workflows = sortByTimestampDesc(
    await readJsonDirectory<WorkflowCheckpoint>(paths.workflowDir),
    (checkpoint) => checkpoint.updatedAt
  );

  return {
    generatedAt: new Date().toISOString(),
    auditSummary: {
      totalEvents: auditEvents.length,
      byType: collectCounts(auditEvents.map((event) => event.type)),
      byStatus: collectCounts(auditEvents.map((event) => event.status)),
      latestTimestamp: auditEvents[0]?.timestamp
    },
    checkpointSummary: {
      totalCheckpoints: checkpoints.length,
      byStatus: collectCounts(checkpoints.map((checkpoint) => checkpoint.status)),
      pendingApproval: checkpoints.filter((checkpoint) => checkpoint.status === "waiting_for_approval").length,
      latestUpdatedAt: checkpoints[0]?.updatedAt
    },
    workflowSummary: {
      totalWorkflows: workflows.length,
      byStatus: collectCounts(workflows.map((checkpoint) => checkpoint.status)),
      pendingParallel: workflows.filter((checkpoint) => Boolean(checkpoint.pendingParallel)).length,
      latestUpdatedAt: workflows[0]?.updatedAt
    },
    recentAuditEvents: auditEvents.slice(0, recentLimit),
    recentCheckpoints: checkpoints.slice(0, recentLimit),
    recentWorkflows: workflows.slice(0, recentLimit)
  };
}

export function renderMonitoringDashboardHtml(
  snapshot: MonitoringSnapshot,
  alerts: MonitoringAlert[] = []
): string {
  const renderCounts = (counts: Record<string, number>): string =>
    Object.entries(counts)
      .map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong>: ${value}</li>`)
      .join("");

  const renderAuditEvents = snapshot.recentAuditEvents
    .map(
      (event) =>
        `<tr><td>${escapeHtml(event.timestamp)}</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(
          event.status
        )}</td><td>${escapeHtml(event.message)}</td></tr>`
    )
    .join("");

  const renderCheckpoints = snapshot.recentCheckpoints
    .map(
      (checkpoint) =>
        `<tr><td>${escapeHtml(checkpoint.checkpointId)}</td><td>${escapeHtml(
          checkpoint.threadId
        )}</td><td>${escapeHtml(checkpoint.status)}</td><td>${escapeHtml(
          checkpoint.updatedAt
        )}</td></tr>`
    )
    .join("");

  const renderWorkflows = snapshot.recentWorkflows
    .map(
      (checkpoint) =>
        `<tr><td>${escapeHtml(checkpoint.checkpointId)}</td><td>${escapeHtml(
          checkpoint.threadId
        )}</td><td>${escapeHtml(checkpoint.status)}</td><td>${escapeHtml(
          checkpoint.updatedAt
        )}</td></tr>`
    )
    .join("");

  const renderAlerts = alerts.length
    ? alerts
        .map(
          (alert) =>
            `<li class="alert ${escapeHtml(alert.severity)}"><strong>${escapeHtml(
              alert.title
            )}</strong><span>${escapeHtml(alert.message)}</span></li>`
        )
        .join("")
    : '<li class="alert info"><strong>No active alerts</strong><span>The runtime looks healthy from the available local artifacts.</span></li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fireworks++ Monitoring Dashboard</title>
  <style>
    :root {
      --bg: #f5f3ef;
      --surface: #fffdf8;
      --border: #d9d0c3;
      --text: #1d1c1a;
      --muted: #6e655a;
      --accent: #c95a1a;
      --warning: #b7791f;
      --critical: #b83232;
      --info: #2b6cb0;
    }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(201, 90, 26, 0.08), transparent 32%),
        linear-gradient(180deg, #f8f4ee 0%, #f5f3ef 100%);
      color: var(--text);
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 24px 64px;
    }
    h1, h2 {
      margin: 0 0 12px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      color: var(--muted);
      margin: 0 0 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin: 24px 0 32px;
    }
    .card {
      background: rgba(255, 253, 248, 0.92);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: 0 10px 30px rgba(29, 28, 26, 0.05);
    }
    .metric {
      font-size: 36px;
      line-height: 1;
      margin-bottom: 10px;
    }
    .lists {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      margin: 6px 0;
    }
    .alerts {
      list-style: none;
      padding: 0;
      margin: 0 0 32px;
    }
    .alert {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: rgba(255, 253, 248, 0.92);
      border: 1px solid var(--border);
      border-left-width: 6px;
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .alert.info { border-left-color: var(--info); }
    .alert.warning { border-left-color: var(--warning); }
    .alert.critical { border-left-color: var(--critical); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(255, 253, 248, 0.92);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    tr:last-child td {
      border-bottom: none;
    }
    @media (max-width: 720px) {
      main {
        padding: 24px 16px 48px;
      }
      .metric {
        font-size: 30px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Fireworks++ Monitoring Dashboard</h1>
    <p>Generated at ${escapeHtml(snapshot.generatedAt)} from local runtime artifacts.</p>

    <section class="grid">
      <div class="card">
        <div class="metric">${snapshot.auditSummary.totalEvents}</div>
        <h2>Audit Events</h2>
        <p>Latest: ${escapeHtml(snapshot.auditSummary.latestTimestamp ?? "n/a")}</p>
      </div>
      <div class="card">
        <div class="metric">${snapshot.checkpointSummary.totalCheckpoints}</div>
        <h2>Agent Runs</h2>
        <p>Pending approval: ${snapshot.checkpointSummary.pendingApproval}</p>
      </div>
      <div class="card">
        <div class="metric">${snapshot.workflowSummary.totalWorkflows}</div>
        <h2>Workflow Runs</h2>
        <p>Pending parallel groups: ${snapshot.workflowSummary.pendingParallel}</p>
      </div>
    </section>

    <h2>Alerts</h2>
    <ul class="alerts">${renderAlerts}</ul>

    <section class="lists">
      <div class="card">
        <h2>Audit Status</h2>
        <ul>${renderCounts(snapshot.auditSummary.byStatus)}</ul>
      </div>
      <div class="card">
        <h2>Checkpoint Status</h2>
        <ul>${renderCounts(snapshot.checkpointSummary.byStatus)}</ul>
      </div>
      <div class="card">
        <h2>Workflow Status</h2>
        <ul>${renderCounts(snapshot.workflowSummary.byStatus)}</ul>
      </div>
    </section>

    <h2>Recent Audit Events</h2>
    <table>
      <thead><tr><th>Timestamp</th><th>Type</th><th>Status</th><th>Message</th></tr></thead>
      <tbody>${renderAuditEvents}</tbody>
    </table>

    <h2>Recent Agent Checkpoints</h2>
    <table>
      <thead><tr><th>Checkpoint</th><th>Thread</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody>${renderCheckpoints}</tbody>
    </table>

    <h2>Recent Workflow Checkpoints</h2>
    <table>
      <thead><tr><th>Checkpoint</th><th>Thread</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody>${renderWorkflows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

