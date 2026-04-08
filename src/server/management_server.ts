import http, { type IncomingMessage, type Server, type ServerResponse } from "http";
import type { Authenticator } from "../auth";
import { AlertManager, loadMonitoringSnapshot, renderMonitoringDashboardHtml } from "../monitoring";

export interface ManagementServerConfig {
  auditPath?: string;
  checkpointDir?: string;
  workflowDir?: string;
  host?: string;
  port?: number;
  authenticator?: Authenticator;
  corsOrigin?: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function toHeaderMap(request: IncomingMessage): Record<string, string | string[] | undefined> {
  return request.headers;
}

function sendJson(response: ServerResponse, statusCode: number, body: JsonValue): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function applyCors(response: ServerResponse, corsOrigin?: string): void {
  if (corsOrigin) {
    response.setHeader("Access-Control-Allow-Origin", corsOrigin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  }
}

export class ManagementServer {
  private config: ManagementServerConfig;
  private server?: Server;

  constructor(config: ManagementServerConfig) {
    this.config = config;
  }

  async authenticateHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Promise<boolean> {
    if (!this.config.authenticator) {
      return true;
    }

    const session = await this.config.authenticator.authenticate(headers);
    return Boolean(session);
  }

  private async authenticate(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (!this.config.authenticator) {
      return true;
    }

    try {
      const authenticated = await this.authenticateHeaders(toHeaderMap(request));
      if (!authenticated) {
        sendJson(response, 401, { error: "Unauthorized" });
        return false;
      }
      return true;
    } catch (error) {
      sendJson(response, 401, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async getDashboardPayload() {
    const snapshot = await loadMonitoringSnapshot({
      auditPath: this.config.auditPath,
      checkpointDir: this.config.checkpointDir,
      workflowDir: this.config.workflowDir
    });
    const alerts = await new AlertManager().evaluate(snapshot);
    return { snapshot, alerts };
  }

  async renderDashboard(): Promise<string> {
    const payload = await this.getDashboardPayload();
    return renderMonitoringDashboardHtml(payload.snapshot, payload.alerts);
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    applyCors(response, this.config.corsOrigin);

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (!(await this.authenticate(request, response))) {
      return;
    }

    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const payload = await this.getDashboardPayload();

    if (url.pathname === "/api/dashboard") {
      sendJson(response, 200, payload as unknown as JsonValue);
      return;
    }

    if (url.pathname === "/api/alerts") {
      sendJson(response, 200, { alerts: payload.alerts } as unknown as JsonValue);
      return;
    }

    if (url.pathname === "/api/audit") {
      sendJson(response, 200, {
        summary: payload.snapshot.auditSummary,
        events: payload.snapshot.recentAuditEvents
      } as unknown as JsonValue);
      return;
    }

    if (url.pathname === "/api/checkpoints") {
      sendJson(response, 200, {
        summary: payload.snapshot.checkpointSummary,
        checkpoints: payload.snapshot.recentCheckpoints
      } as unknown as JsonValue);
      return;
    }

    if (url.pathname === "/api/workflows") {
      sendJson(response, 200, {
        summary: payload.snapshot.workflowSummary,
        workflows: payload.snapshot.recentWorkflows
      } as unknown as JsonValue);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/dashboard") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(await this.renderDashboard());
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  }

  async start(): Promise<{ url: string; port: number }> {
    if (this.server) {
      throw new Error("Management server is already running.");
    }

    this.server = http.createServer((request, response) => {
      this.handleRequest(request, response).catch((error) => {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error)
        });
      });
    });

    const host = this.config.host ?? "127.0.0.1";
    const port = this.config.port ?? 0;

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(port, host, () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to determine management server address.");
    }

    return {
      url: `http://${host}:${address.port}`,
      port: address.port
    };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const activeServer = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
