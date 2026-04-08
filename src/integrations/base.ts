import type { AuditEvent } from "../governance";
import type { MonitoringAlert } from "../monitoring";

export type ConnectorPayload =
  | { kind: "audit"; event: AuditEvent }
  | { kind: "alert"; alert: MonitoringAlert }
  | { kind: "snapshot"; snapshot: Record<string, unknown> };

export interface IntegrationConnector {
  send(payload: ConnectorPayload): Promise<void>;
}

