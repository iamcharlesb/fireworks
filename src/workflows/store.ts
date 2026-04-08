import { promises as fs } from "fs";
import path from "path";
import type {
  WorkflowCheckpoint,
  WorkflowCheckpointListOptions,
  WorkflowCheckpointStore
} from "./base";
import { cloneWorkflowCheckpoint } from "./base";

export interface FileWorkflowCheckpointStoreConfig {
  directory?: string;
}

function sortNewestFirst(checkpoints: WorkflowCheckpoint[]): WorkflowCheckpoint[] {
  return [...checkpoints].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class InMemoryWorkflowCheckpointStore implements WorkflowCheckpointStore {
  private checkpoints = new Map<string, WorkflowCheckpoint>();

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpointId, cloneWorkflowCheckpoint(checkpoint));
  }

  async get(checkpointId: string): Promise<WorkflowCheckpoint | undefined> {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint ? cloneWorkflowCheckpoint(checkpoint) : undefined;
  }

  async getLatest(threadId: string): Promise<WorkflowCheckpoint | undefined> {
    const checkpoints = await this.list({ threadId, limit: 1 });
    return checkpoints[0];
  }

  async list(options: WorkflowCheckpointListOptions = {}): Promise<WorkflowCheckpoint[]> {
    let checkpoints = Array.from(this.checkpoints.values());

    if (options.threadId) {
      checkpoints = checkpoints.filter((checkpoint) => checkpoint.threadId === options.threadId);
    }

    if (options.status) {
      checkpoints = checkpoints.filter((checkpoint) => checkpoint.status === options.status);
    }

    const sorted = sortNewestFirst(checkpoints).map((checkpoint) =>
      cloneWorkflowCheckpoint(checkpoint)
    );
    if (options.limit !== undefined) {
      return sorted.slice(0, options.limit);
    }

    return sorted;
  }

  async delete(checkpointId: string): Promise<void> {
    this.checkpoints.delete(checkpointId);
  }

  async clear(): Promise<void> {
    this.checkpoints.clear();
  }
}

export class FileWorkflowCheckpointStore implements WorkflowCheckpointStore {
  private directory: string;

  constructor(config: FileWorkflowCheckpointStoreConfig = {}) {
    this.directory = path.resolve(config.directory ?? path.join(".fireworks-plus-plus", "workflows"));
  }

  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.directory, `${checkpointId}.json`);
  }

  private async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
  }

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    await this.ensureDirectory();
    await fs.writeFile(
      this.getCheckpointPath(checkpoint.checkpointId),
      JSON.stringify(checkpoint, null, 2),
      "utf8"
    );
  }

  async get(checkpointId: string): Promise<WorkflowCheckpoint | undefined> {
    await this.ensureDirectory();

    try {
      const content = await fs.readFile(this.getCheckpointPath(checkpointId), "utf8");
      return cloneWorkflowCheckpoint(JSON.parse(content) as WorkflowCheckpoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async getLatest(threadId: string): Promise<WorkflowCheckpoint | undefined> {
    const checkpoints = await this.list({ threadId, limit: 1 });
    return checkpoints[0];
  }

  async list(options: WorkflowCheckpointListOptions = {}): Promise<WorkflowCheckpoint[]> {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const checkpoints: WorkflowCheckpoint[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const content = await fs.readFile(path.join(this.directory, entry.name), "utf8");
      checkpoints.push(JSON.parse(content) as WorkflowCheckpoint);
    }

    let filtered = checkpoints;
    if (options.threadId) {
      filtered = filtered.filter((checkpoint) => checkpoint.threadId === options.threadId);
    }

    if (options.status) {
      filtered = filtered.filter((checkpoint) => checkpoint.status === options.status);
    }

    const sorted = sortNewestFirst(filtered).map((checkpoint) =>
      cloneWorkflowCheckpoint(checkpoint)
    );
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
