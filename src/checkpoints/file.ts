import { promises as fs } from "fs";
import path from "path";
import type { AgentCheckpoint, CheckpointStore, ListCheckpointsOptions } from "./base";
import { cloneCheckpoint } from "./base";

export interface FileCheckpointStoreConfig {
  directory?: string;
}

function sortNewestFirst(checkpoints: AgentCheckpoint[]): AgentCheckpoint[] {
  return [...checkpoints].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class FileCheckpointStore implements CheckpointStore {
  private directory: string;

  constructor(config: FileCheckpointStoreConfig = {}) {
    this.directory = path.resolve(config.directory ?? path.join(".fireworks-plus-plus", "checkpoints"));
  }

  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.directory, `${checkpointId}.json`);
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
  }

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    await this.ensureDirectory();
    const filePath = this.getCheckpointPath(checkpoint.checkpointId);
    await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), "utf8");
  }

  async get(checkpointId: string): Promise<AgentCheckpoint | undefined> {
    await this.ensureDirectory();

    try {
      const filePath = this.getCheckpointPath(checkpointId);
      const content = await fs.readFile(filePath, "utf8");
      return cloneCheckpoint(JSON.parse(content) as AgentCheckpoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async getLatest(threadId: string): Promise<AgentCheckpoint | undefined> {
    const checkpoints = await this.list({ threadId, limit: 1 });
    return checkpoints[0];
  }

  async list(options: ListCheckpointsOptions = {}): Promise<AgentCheckpoint[]> {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const checkpoints: AgentCheckpoint[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const content = await fs.readFile(path.join(this.directory, entry.name), "utf8");
      const checkpoint = JSON.parse(content) as AgentCheckpoint;
      checkpoints.push(checkpoint);
    }

    let filtered = checkpoints;

    if (options.threadId) {
      filtered = filtered.filter((checkpoint) => checkpoint.threadId === options.threadId);
    }

    if (options.status) {
      filtered = filtered.filter((checkpoint) => checkpoint.status === options.status);
    }

    const sorted = sortNewestFirst(filtered).map((checkpoint) => cloneCheckpoint(checkpoint));
    if (options.limit !== undefined) {
      return sorted.slice(0, options.limit);
    }

    return sorted;
  }

  async delete(checkpointId: string): Promise<void> {
    await this.ensureDirectory();

    try {
      await fs.unlink(this.getCheckpointPath(checkpointId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        await fs.unlink(path.join(this.directory, entry.name));
      }
    }
  }
}
