import { promises as fs } from "fs";
import path from "path";
import { uuidv4 } from "../utils/uuid";
import type { AuditEvent, AuditEventFilter, AuditLogger } from "./base";

function normalizeEvent(event: Omit<AuditEvent, "id" | "timestamp"> & Partial<AuditEvent>): AuditEvent {
  return {
    id: event.id ?? uuidv4(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    type: event.type,
    status: event.status,
    actorId: event.actorId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    message: event.message,
    details: event.details
  };
}

function matchesFilter(event: AuditEvent, filter: AuditEventFilter): boolean {
  if (filter.type && event.type !== filter.type) return false;
  if (filter.status && event.status !== filter.status) return false;
  if (filter.actorId && event.actorId !== filter.actorId) return false;
  if (filter.resourceType && event.resourceType !== filter.resourceType) return false;
  if (filter.resourceId && event.resourceId !== filter.resourceId) return false;
  return true;
}

export class InMemoryAuditLogger implements AuditLogger {
  private events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(normalizeEvent(event));
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEvent[]> {
    const events = this.events.filter((event) => matchesFilter(event, filter));
    const ordered = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return filter.limit !== undefined ? ordered.slice(0, filter.limit) : ordered;
  }

  async clear(): Promise<void> {
    this.events = [];
  }
}

export interface FileAuditLoggerConfig {
  filePath?: string;
}

export class FileAuditLogger implements AuditLogger {
  private filePath: string;

  constructor(config: FileAuditLoggerConfig = {}) {
    this.filePath = path.resolve(config.filePath ?? path.join(".fireworks-plus-plus", "audit.log"));
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async record(event: AuditEvent): Promise<void> {
    await this.ensureDirectory();
    const normalized = normalizeEvent(event);
    await fs.appendFile(this.filePath, `${JSON.stringify(normalized)}\n`, "utf8");
  }

  async list(filter: AuditEventFilter = {}): Promise<AuditEvent[]> {
    await this.ensureDirectory();

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      const events = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditEvent)
        .filter((event) => matchesFilter(event, filter))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return filter.limit !== undefined ? events.slice(0, filter.limit) : events;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(this.filePath, "", "utf8");
  }
}
