import { uuidv4 } from "../utils/uuid";
import type {
  MonitoringAlert,
  MonitoringAlertRule,
  MonitoringSnapshot
} from "./base";

export interface AlertManagerConfig {
  rules?: MonitoringAlertRule[];
  staleAfterMs?: number;
  now?: () => Date;
}

function hoursBetween(fromIso: string, now: Date): number {
  return Math.max(0, now.getTime() - new Date(fromIso).getTime()) / 3_600_000;
}

function buildDefaultRules(staleAfterMs: number, now: () => Date): MonitoringAlertRule[] {
  return [
    {
      id: "audit-errors",
      evaluate(snapshot: MonitoringSnapshot): MonitoringAlert | undefined {
        const errorCount =
          (snapshot.auditSummary.byStatus["error"] ?? 0) +
          (snapshot.auditSummary.byStatus["warning"] ?? 0);

        if (errorCount === 0) return undefined;

        return {
          id: uuidv4(),
          severity: snapshot.auditSummary.byStatus["error"] ? "critical" : "warning",
          title: "Audit failures detected",
          message: `${errorCount} warning/error audit events were recorded.`,
          source: "audit",
          details: { errorCount }
        };
      }
    },
    {
      id: "pending-approvals",
      evaluate(snapshot: MonitoringSnapshot): MonitoringAlert | undefined {
        if (snapshot.checkpointSummary.pendingApproval === 0) return undefined;

        return {
          id: uuidv4(),
          severity: "warning",
          title: "Approval backlog",
          message: `${snapshot.checkpointSummary.pendingApproval} agent run(s) are waiting for approval.`,
          source: "checkpoint",
          details: { pendingApproval: snapshot.checkpointSummary.pendingApproval }
        };
      }
    },
    {
      id: "stale-pauses",
      evaluate(snapshot: MonitoringSnapshot): MonitoringAlert[] {
        const currentTime = now();
        return snapshot.recentCheckpoints
          .filter((checkpoint) => checkpoint.status === "waiting_for_approval")
          .filter((checkpoint) => currentTime.getTime() - new Date(checkpoint.updatedAt).getTime() >= staleAfterMs)
          .map((checkpoint) => ({
            id: uuidv4(),
            severity: "warning" as const,
            title: "Stale approval checkpoint",
            message: `Checkpoint ${checkpoint.checkpointId} has been waiting for approval for ${hoursBetween(
              checkpoint.updatedAt,
              currentTime
            ).toFixed(1)} hour(s).`,
            source: "checkpoint" as const,
            details: { checkpointId: checkpoint.checkpointId, updatedAt: checkpoint.updatedAt }
          }));
      }
    },
    {
      id: "paused-workflows",
      evaluate(snapshot: MonitoringSnapshot): MonitoringAlert | undefined {
        const pausedCount = snapshot.workflowSummary.byStatus["paused"] ?? 0;
        if (pausedCount === 0) return undefined;

        return {
          id: uuidv4(),
          severity: "warning",
          title: "Paused workflows",
          message: `${pausedCount} workflow run(s) are currently paused.`,
          source: "workflow",
          details: { pausedCount }
        };
      }
    },
    {
      id: "budget-denials",
      evaluate(snapshot: MonitoringSnapshot): MonitoringAlert | undefined {
        const budgetDenials = Object.entries(snapshot.auditSummary.byType)
          .filter(([type]) => type.includes("denied.budget"))
          .reduce((sum, [, count]) => sum + count, 0);

        if (budgetDenials === 0) return undefined;

        return {
          id: uuidv4(),
          severity: "critical",
          title: "Budget denials",
          message: `${budgetDenials} runtime action(s) were denied because of budget limits.`,
          source: "budget",
          details: { budgetDenials }
        };
      }
    }
  ];
}

export class AlertManager {
  private rules: MonitoringAlertRule[];

  constructor(config: AlertManagerConfig = {}) {
    const staleAfterMs = config.staleAfterMs ?? 15 * 60 * 1000;
    const now = config.now ?? (() => new Date());
    this.rules = config.rules ?? buildDefaultRules(staleAfterMs, now);
  }

  async evaluate(snapshot: MonitoringSnapshot): Promise<MonitoringAlert[]> {
    const alerts: MonitoringAlert[] = [];

    for (const rule of this.rules) {
      const result = await rule.evaluate(snapshot);
      if (!result) continue;
      if (Array.isArray(result)) {
        alerts.push(...result);
      } else {
        alerts.push(result);
      }
    }

    return alerts.sort((left, right) => {
      const rank = { critical: 0, warning: 1, info: 2 };
      return rank[left.severity] - rank[right.severity];
    });
  }
}

