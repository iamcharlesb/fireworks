import type { ChainValues } from "../schema/types";
import type {
  WorkflowCheckpoint,
  WorkflowHistoryEntry,
  WorkflowMergeStrategy
} from "./base";

export interface WorkflowNodeContext {
  workflowId: string;
  checkpointId: string;
  threadId: string;
  runId: string;
  nodeId: string;
  checkpoint: WorkflowCheckpoint;
  history: WorkflowHistoryEntry[];
  parallelGroupId?: string;
  branchId?: string;
  branchLabel?: string;
}

export interface WorkflowParallelBranch {
  nodeId: string;
  state?: ChainValues;
  label?: string;
}

export interface WorkflowNodeResult {
  state?: ChainValues;
  next?: string;
  pause?: boolean;
  pauseReason?: string;
  output?: ChainValues;
  parallel?: WorkflowParallelBranch[];
  mergeStrategy?: WorkflowMergeStrategy;
  namespaceKey?: string;
  metadata?: Record<string, unknown>;
}

export type WorkflowNodeHandler = (
  state: ChainValues,
  context: WorkflowNodeContext
) => Promise<WorkflowNodeResult | ChainValues | void> | WorkflowNodeResult | ChainValues | void;

export type WorkflowCondition = (
  state: ChainValues,
  context: WorkflowNodeContext
) => Promise<boolean> | boolean;

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: WorkflowCondition;
  label?: string;
}

export interface WorkflowBranch {
  to: string;
  condition: WorkflowCondition;
  label?: string;
}

export interface ResolvedWorkflowEdge {
  to?: string;
  label?: string;
}

export class WorkflowGraph {
  private nodes = new Map<string, WorkflowNodeHandler>();
  private edges = new Map<string, WorkflowEdge[]>();
  private startNodeId?: string;
  private terminalNodes = new Set<string>();

  constructor(readonly workflowId: string) {}

  addNode(
    nodeId: string,
    handler: WorkflowNodeHandler,
    options: { start?: boolean; terminal?: boolean } = {}
  ): this {
    this.nodes.set(nodeId, handler);

    if (options.start || !this.startNodeId) {
      this.startNodeId = nodeId;
    }

    if (options.terminal) {
      this.terminalNodes.add(nodeId);
    }

    return this;
  }

  addEdge(
    from: string,
    to: string,
    condition?: WorkflowCondition,
    label?: string
  ): this {
    const edges = this.edges.get(from) ?? [];
    edges.push({ from, to, condition, label });
    this.edges.set(from, edges);
    return this;
  }

  addConditionalEdges(from: string, branches: WorkflowBranch[]): this {
    for (const branch of branches) {
      this.addEdge(from, branch.to, branch.condition, branch.label);
    }
    return this;
  }

  setStart(nodeId: string): this {
    this.startNodeId = nodeId;
    return this;
  }

  markTerminal(nodeId: string): this {
    this.terminalNodes.add(nodeId);
    return this;
  }

  getStartNode(): string {
    if (!this.startNodeId) {
      throw new Error(`Workflow "${this.workflowId}" does not have a start node.`);
    }
    return this.startNodeId;
  }

  getNode(nodeId: string): WorkflowNodeHandler {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Workflow "${this.workflowId}" is missing node "${nodeId}".`);
    }
    return node;
  }

  isTerminal(nodeId: string): boolean {
    return this.terminalNodes.has(nodeId);
  }

  async resolveNext(
    nodeId: string,
    state: ChainValues,
    context: WorkflowNodeContext
  ): Promise<ResolvedWorkflowEdge> {
    const edges = this.edges.get(nodeId) ?? [];
    let fallback: WorkflowEdge | undefined;

    for (const edge of edges) {
      if (!edge.condition) {
        fallback ??= edge;
        continue;
      }

      if (await edge.condition(state, context)) {
        return { to: edge.to, label: edge.label };
      }
    }

    return fallback ? { to: fallback.to, label: fallback.label } : {};
  }

  validate(): void {
    const startNode = this.getStartNode();
    this.getNode(startNode);

    for (const [from, edges] of this.edges.entries()) {
      this.getNode(from);
      for (const edge of edges) {
        this.getNode(edge.to);
      }
    }
  }
}
