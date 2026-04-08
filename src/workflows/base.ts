import type { ChainValues } from "../schema/types";

export type WorkflowStatus = "running" | "paused" | "completed" | "error";
export type WorkflowStepStatus = "completed" | "paused" | "error";
export type WorkflowBranchStatus = "running" | "paused" | "completed" | "error";
export type WorkflowMergeStrategy = "namespaced" | "shallow";

export interface WorkflowHistoryEntry {
  nodeId: string;
  startedAt: string;
  endedAt: string;
  status: WorkflowStepStatus;
  nextNodeId?: string;
  branch?: string;
  parallelGroupId?: string;
  statePatch?: ChainValues;
  output?: ChainValues;
  pauseReason?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowParallelBranchCheckpoint {
  branchId: string;
  label: string;
  entryNodeId: string;
  currentNodeId?: string;
  status: WorkflowBranchStatus;
  state: ChainValues;
  output?: ChainValues;
  pauseReason?: string;
  error?: string;
}

export interface WorkflowParallelState {
  groupId: string;
  sourceNodeId: string;
  nextNodeId?: string;
  mergeStrategy: WorkflowMergeStrategy;
  namespaceKey?: string;
  branches: WorkflowParallelBranchCheckpoint[];
  startedAt: string;
  updatedAt: string;
}

export interface WorkflowCheckpoint {
  checkpointId: string;
  workflowId: string;
  threadId: string;
  runId: string;
  status: WorkflowStatus;
  currentNodeId?: string;
  state: ChainValues;
  history: WorkflowHistoryEntry[];
  pendingParallel?: WorkflowParallelState;
  output?: ChainValues;
  pauseReason?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowCheckpointListOptions {
  threadId?: string;
  status?: WorkflowStatus;
  limit?: number;
}

export interface WorkflowCheckpointStore {
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
  get(checkpointId: string): Promise<WorkflowCheckpoint | undefined>;
  getLatest(threadId: string): Promise<WorkflowCheckpoint | undefined>;
  list(options?: WorkflowCheckpointListOptions): Promise<WorkflowCheckpoint[]>;
  delete(checkpointId: string): Promise<void>;
  clear(): Promise<void>;
}

export function cloneWorkflowCheckpoint<T extends WorkflowCheckpoint>(checkpoint: T): T {
  return JSON.parse(JSON.stringify(checkpoint)) as T;
}
