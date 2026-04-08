import type { AgentCheckpoint } from "../checkpoints";
import type { AuditEvent } from "../governance";
import type { WorkflowCheckpoint } from "../workflows";

export interface LocalArtifactPaths {
  auditPath?: string;
  checkpointDir?: string;
  workflowDir?: string;
}

export interface MonitoringAuditSummary {
  totalEvents: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  latestTimestamp?: string;
}

export interface MonitoringCheckpointSummary {
  totalCheckpoints: number;
  byStatus: Record<string, number>;
  pendingApproval: number;
  latestUpdatedAt?: string;
}

export interface MonitoringWorkflowSummary {
  totalWorkflows: number;
  byStatus: Record<string, number>;
  pendingParallel: number;
  latestUpdatedAt?: string;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  auditSummary: MonitoringAuditSummary;
  checkpointSummary: MonitoringCheckpointSummary;
  workflowSummary: MonitoringWorkflowSummary;
  recentAuditEvents: AuditEvent[];
  recentCheckpoints: AgentCheckpoint[];
  recentWorkflows: WorkflowCheckpoint[];
}

export type MonitoringAlertSeverity = "info" | "warning" | "critical";

export interface MonitoringAlert {
  id: string;
  severity: MonitoringAlertSeverity;
  title: string;
  message: string;
  source: "audit" | "checkpoint" | "workflow" | "budget" | "monitoring";
  details?: Record<string, unknown>;
}

export interface MonitoringAlertRule {
  id: string;
  evaluate(snapshot: MonitoringSnapshot): MonitoringAlert | MonitoringAlert[] | undefined;
}

