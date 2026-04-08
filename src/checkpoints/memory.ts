import type { AgentCheckpoint, CheckpointStore, ListCheckpointsOptions } from "./base";
import { cloneCheckpoint } from "./base";

function sortNewestFirst(checkpoints: AgentCheckpoint[]): AgentCheckpoint[] {
  return [...checkpoints].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private checkpoints = new Map<string, AgentCheckpoint>();

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpointId, cloneCheckpoint(checkpoint));
  }

  async get(checkpointId: string): Promise<AgentCheckpoint | undefined> {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint ? cloneCheckpoint(checkpoint) : undefined;
  }

  async getLatest(threadId: string): Promise<AgentCheckpoint | undefined> {
    const checkpoints = await this.list({ threadId, limit: 1 });
    return checkpoints[0];
  }

  async list(options: ListCheckpointsOptions = {}): Promise<AgentCheckpoint[]> {
    let checkpoints = Array.from(this.checkpoints.values());

    if (options.threadId) {
      checkpoints = checkpoints.filter((checkpoint) => checkpoint.threadId === options.threadId);
    }

    if (options.status) {
      checkpoints = checkpoints.filter((checkpoint) => checkpoint.status === options.status);
    }

    const sorted = sortNewestFirst(checkpoints).map((checkpoint) => cloneCheckpoint(checkpoint));
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
