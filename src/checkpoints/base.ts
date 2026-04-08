import type {
  AgentAction,
  ChainValues,
  IntermediateStep,
  Message,
  ToolCall
} from "../schema/types";

export type CheckpointStatus = "running" | "waiting_for_approval" | "completed" | "error";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  toolCall: ToolCall;
  action: AgentAction;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  reviewer?: string;
  reason?: string;
}

export type WorkflowEventType =
  | "started"
  | "resumed"
  | "assistant"
  | "approval_requested"
  | "approval_resolved"
  | "tool_result"
  | "completed"
  | "error";

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: string;
  iteration: number;
  data?: Record<string, unknown>;
}

export interface AgentCheckpoint {
  checkpointId: string;
  threadId: string;
  runId: string;
  agentType: string;
  status: CheckpointStatus;
  iteration: number;
  maxIterations: number;
  input: ChainValues;
  messages: Message[];
  intermediateSteps: IntermediateStep[];
  pendingToolCalls?: ToolCall[];
  approval?: ApprovalRequest;
  workflow: WorkflowEvent[];
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ListCheckpointsOptions {
  threadId?: string;
  status?: CheckpointStatus;
  limit?: number;
}

export interface CheckpointStore {
  save(checkpoint: AgentCheckpoint): Promise<void>;
  get(checkpointId: string): Promise<AgentCheckpoint | undefined>;
  getLatest(threadId: string): Promise<AgentCheckpoint | undefined>;
  list(options?: ListCheckpointsOptions): Promise<AgentCheckpoint[]>;
  delete(checkpointId: string): Promise<void>;
  clear(): Promise<void>;
}

export function cloneCheckpoint<T extends AgentCheckpoint>(checkpoint: T): T {
  return JSON.parse(JSON.stringify(checkpoint)) as T;
}
