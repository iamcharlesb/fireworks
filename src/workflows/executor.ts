import { uuidv4 } from "../utils/uuid";
import type { ChainValues } from "../schema/types";
import type {
  AuditLogger,
  AuthorizationProvider,
  BudgetController,
  GovernanceActor,
  PolicyProvider,
  ScopedBudgetController
} from "../governance";
import type {
  WorkflowCheckpoint,
  WorkflowCheckpointStore,
  WorkflowHistoryEntry,
  WorkflowMergeStrategy,
  WorkflowParallelBranchCheckpoint,
  WorkflowParallelState
} from "./base";
import type {
  WorkflowNodeContext,
  WorkflowNodeResult,
  WorkflowParallelBranch
} from "./graph";
import { WorkflowGraph } from "./graph";

export interface WorkflowExecutorConfig {
  checkpointStore?: WorkflowCheckpointStore;
  threadId?: string;
  maxSteps?: number;
  metadata?: Record<string, unknown>;
  verbose?: boolean;
  actor?: GovernanceActor;
  authorizer?: AuthorizationProvider;
  policyEngine?: PolicyProvider;
  budgetManager?: BudgetController;
  auditLogger?: AuditLogger;
}

interface BranchExecutionResult {
  branch: WorkflowParallelBranchCheckpoint;
  historyEntries: WorkflowHistoryEntry[];
}

export class WorkflowExecutor {
  private checkpointStore?: WorkflowCheckpointStore;
  private defaultThreadId?: string;
  private maxSteps: number;
  private metadata?: Record<string, unknown>;
  private verbose: boolean;
  private actor?: GovernanceActor;
  private authorizer?: AuthorizationProvider;
  private policyEngine?: PolicyProvider;
  private budgetManager?: BudgetController;
  private auditLogger?: AuditLogger;

  constructor(
    private graph: WorkflowGraph,
    config: WorkflowExecutorConfig = {}
  ) {
    this.graph.validate();
    this.checkpointStore = config.checkpointStore;
    this.defaultThreadId = config.threadId;
    this.maxSteps = config.maxSteps ?? 50;
    this.metadata = config.metadata;
    this.verbose = config.verbose ?? false;
    this.actor = config.actor;
    this.authorizer = config.authorizer;
    this.policyEngine = config.policyEngine;
    this.budgetManager = config.budgetManager;
    this.auditLogger = config.auditLogger;
  }

  private resolveBudgetScopes(threadId: string): string[] {
    const scopes: string[] = [];
    if (this.actor?.id) {
      scopes.push(`actor:${this.actor.id}`);
    }
    const teams = this.actor?.attributes?.["teams"];
    if (Array.isArray(teams)) {
      for (const team of teams) {
        scopes.push(`team:${String(team)}`);
      }
    }
    scopes.push(`thread:${threadId}`);
    return scopes;
  }

  private consumeBudget(name: string, amount: number, threadId: string) {
    const decisions = [];
    if (this.budgetManager) {
      decisions.push(this.budgetManager.consume(name, amount));
      const scopedManager = this.budgetManager as ScopedBudgetController;
      if (typeof scopedManager.consumeScoped === "function") {
        for (const scope of this.resolveBudgetScopes(threadId)) {
          decisions.push(scopedManager.consumeScoped(scope, name, amount));
        }
      }
    }
    return decisions.find((decision) => !decision.allowed);
  }

  async run(initialState: ChainValues = {}): Promise<ChainValues> {
    const runId = uuidv4();
    const threadId = this.resolveThreadId(initialState, runId);
    const now = new Date().toISOString();
    const checkpoint: WorkflowCheckpoint = {
      checkpointId: uuidv4(),
      workflowId: this.graph.workflowId,
      threadId,
      runId,
      status: "running",
      currentNodeId: this.graph.getStartNode(),
      state: { ...initialState },
      history: [],
      metadata: this.metadata ? { ...this.metadata } : undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.auditLogger?.record({
      id: runId,
      timestamp: now,
      type: "workflow.run.started",
      status: "info",
      actorId: this.actor?.id,
      resourceType: "workflow",
      resourceId: this.graph.workflowId,
      message: `Started workflow "${this.graph.workflowId}".`,
      details: { threadId }
    });

    return this.execute(checkpoint);
  }

  async resume(threadId: string, statePatch: ChainValues = {}): Promise<ChainValues> {
    if (!this.checkpointStore) {
      throw new Error("Workflow checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.getLatest(threadId);
    if (!checkpoint) {
      throw new Error(`No workflow checkpoint found for thread: ${threadId}`);
    }

    return this.resumeFromCheckpoint(checkpoint.checkpointId, statePatch);
  }

  async resumeFromCheckpoint(
    checkpointId: string,
    statePatch: ChainValues = {}
  ): Promise<ChainValues> {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    if (checkpoint.status === "completed") {
      return this.checkpointToResult(checkpoint);
    }

    checkpoint.state = {
      ...checkpoint.state,
      ...statePatch
    };

    if (checkpoint.pendingParallel) {
      checkpoint.pendingParallel.branches = checkpoint.pendingParallel.branches.map((branch) =>
        branch.status === "completed"
          ? branch
          : {
              ...branch,
              state: {
                ...branch.state,
                ...statePatch
              }
            }
      );
    }

    checkpoint.status = "running";
    checkpoint.error = undefined;
    checkpoint.pauseReason = undefined;
    await this.auditLogger?.record({
      id: checkpoint.runId,
      timestamp: new Date().toISOString(),
      type: "workflow.run.resumed",
      status: "info",
      actorId: this.actor?.id,
      resourceType: "workflow",
      resourceId: checkpoint.workflowId,
      message: `Resumed workflow checkpoint "${checkpoint.checkpointId}".`,
      details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
    });

    return this.execute(checkpoint);
  }

  private async execute(checkpoint: WorkflowCheckpoint): Promise<ChainValues> {
    try {
      while (checkpoint.currentNodeId || checkpoint.pendingParallel) {
        this.ensureStepLimit(checkpoint);

        if (checkpoint.pendingParallel) {
          const paused = await this.executeParallelGroup(checkpoint);
          if (paused) {
            return this.checkpointToResult(checkpoint);
          }
          continue;
        }

        const nodeId = checkpoint.currentNodeId!;
        await this.enforceWorkflowGovernance(checkpoint, nodeId, checkpoint.state);
        const node = this.graph.getNode(nodeId);
        const startedAt = new Date().toISOString();
        const context = this.buildContext(checkpoint, nodeId);

        if (this.verbose) {
          console.log(`[WorkflowExecutor] ${checkpoint.workflowId} -> ${nodeId}`);
        }

        const rawResult = await node({ ...checkpoint.state }, context);
        const result = this.normalizeResult(rawResult);

        if ((result.parallel?.length ?? 0) > 0 && result.pause) {
          throw new Error(`Workflow node "${nodeId}" cannot pause and fan out in the same step.`);
        }

        const statePatch = result.state ?? {};
        checkpoint.state = {
          ...checkpoint.state,
          ...statePatch
        };

        const resolvedEdge = await this.resolveNextNode(nodeId, checkpoint.state, context, result.next);

        const historyEntry: WorkflowHistoryEntry = {
          nodeId,
          startedAt,
          endedAt: new Date().toISOString(),
          status: result.pause ? "paused" : "completed",
          nextNodeId: resolvedEdge.to,
          branch: resolvedEdge.label,
          statePatch: Object.keys(statePatch).length > 0 ? { ...statePatch } : undefined,
          output: result.output ? { ...result.output } : undefined,
          pauseReason: result.pauseReason,
          metadata: result.metadata ? { ...result.metadata } : undefined
        };
        checkpoint.history.push(historyEntry);

        if ((result.parallel?.length ?? 0) > 0) {
          checkpoint.pendingParallel = this.createParallelState(
            checkpoint,
            nodeId,
            result.parallel!,
            resolvedEdge.to,
            result.mergeStrategy ?? "namespaced",
            result.namespaceKey
          );
          checkpoint.currentNodeId = undefined;
          checkpoint.output = undefined;
          await this.saveCheckpoint(checkpoint);

          const paused = await this.executeParallelGroup(checkpoint);
          if (paused) {
            return this.checkpointToResult(checkpoint);
          }
          continue;
        }

        checkpoint.output = result.output
          ? { ...result.output }
          : resolvedEdge.to
          ? undefined
          : { ...checkpoint.state };

        if (result.pause) {
          checkpoint.status = "paused";
          checkpoint.pauseReason = result.pauseReason;
          checkpoint.currentNodeId = resolvedEdge.to;
          await this.auditLogger?.record({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            type: "workflow.node.paused",
            status: "warning",
            actorId: this.actor?.id,
            resourceType: "workflow_node",
            resourceId: nodeId,
            message: result.pauseReason ?? `Paused node "${nodeId}".`,
            details: { checkpointId: checkpoint.checkpointId, workflowId: checkpoint.workflowId }
          });
          await this.saveCheckpoint(checkpoint);
          return this.checkpointToResult(checkpoint);
        }

        checkpoint.pauseReason = undefined;
        checkpoint.currentNodeId = resolvedEdge.to;

        if (!checkpoint.currentNodeId) {
          checkpoint.status = "completed";
          await this.auditLogger?.record({
            id: checkpoint.runId,
            timestamp: new Date().toISOString(),
            type: "workflow.run.completed",
            status: "success",
            actorId: this.actor?.id,
            resourceType: "workflow",
            resourceId: checkpoint.workflowId,
            message: `Completed workflow "${checkpoint.workflowId}".`,
            details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
          });
          await this.saveCheckpoint(checkpoint);
          return this.checkpointToResult(checkpoint);
        }

        await this.saveCheckpoint(checkpoint);
      }

      checkpoint.status = "completed";
      checkpoint.output = checkpoint.output ?? { ...checkpoint.state };
      await this.auditLogger?.record({
        id: checkpoint.runId,
        timestamp: new Date().toISOString(),
        type: "workflow.run.completed",
        status: "success",
        actorId: this.actor?.id,
        resourceType: "workflow",
        resourceId: checkpoint.workflowId,
        message: `Completed workflow "${checkpoint.workflowId}".`,
        details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
      });
      await this.saveCheckpoint(checkpoint);
      return this.checkpointToResult(checkpoint);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      checkpoint.status = "error";
      checkpoint.error = err.message;
      await this.auditLogger?.record({
        id: checkpoint.runId,
        timestamp: new Date().toISOString(),
        type: "workflow.run.error",
        status: "error",
        actorId: this.actor?.id,
        resourceType: "workflow",
        resourceId: checkpoint.workflowId,
        message: err.message,
        details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
      });
      await this.saveCheckpoint(checkpoint);
      throw err;
    }
  }

  private async executeParallelGroup(checkpoint: WorkflowCheckpoint): Promise<boolean> {
    const group = checkpoint.pendingParallel!;
    group.updatedAt = new Date().toISOString();

    const runnableBranches = group.branches.filter((branch) =>
      branch.status === "running" || branch.status === "paused"
    );

    if (runnableBranches.length === 0) {
      this.mergeParallelGroup(checkpoint, group);
      await this.saveCheckpoint(checkpoint);
      return false;
    }

    const results = await Promise.all(
      runnableBranches.map((branch) => this.executeBranch(checkpoint, group, branch))
    );

    const branchById = new Map(results.map((result) => [result.branch.branchId, result]));
    group.branches = group.branches.map((branch) => branchById.get(branch.branchId)?.branch ?? branch);

    for (const branch of group.branches) {
      const result = branchById.get(branch.branchId);
      if (result) {
        checkpoint.history.push(...result.historyEntries);
      }
    }

    const errorBranch = group.branches.find((branch) => branch.status === "error");
    if (errorBranch) {
      checkpoint.status = "error";
      checkpoint.error = errorBranch.error ?? `Parallel branch "${errorBranch.label}" failed.`;
      await this.saveCheckpoint(checkpoint);
      throw new Error(checkpoint.error);
    }

    const pausedBranch = group.branches.find((branch) => branch.status === "paused");
    if (pausedBranch) {
      checkpoint.status = "paused";
      checkpoint.pauseReason =
        pausedBranch.pauseReason ?? `Parallel branch "${pausedBranch.label}" is paused.`;
      checkpoint.currentNodeId = undefined;
      await this.saveCheckpoint(checkpoint);
      return true;
    }

    this.mergeParallelGroup(checkpoint, group);
    await this.saveCheckpoint(checkpoint);
    return false;
  }

  private async executeBranch(
    checkpoint: WorkflowCheckpoint,
    group: WorkflowParallelState,
    branch: WorkflowParallelBranchCheckpoint
  ): Promise<BranchExecutionResult> {
    const workingBranch: WorkflowParallelBranchCheckpoint = {
      ...branch,
      state: { ...branch.state },
      output: branch.output ? { ...branch.output } : undefined
    };
    const historyEntries: WorkflowHistoryEntry[] = [];

    try {
      while (workingBranch.currentNodeId) {
        this.ensureStepLimit(checkpoint, historyEntries.length);

        const nodeId = workingBranch.currentNodeId;
        await this.enforceWorkflowGovernance(
          checkpoint,
          nodeId,
          workingBranch.state,
          group.groupId,
          workingBranch.branchId
        );
        const node = this.graph.getNode(nodeId);
        const startedAt = new Date().toISOString();
        const context = this.buildContext(checkpoint, nodeId, group.groupId, workingBranch.branchId, workingBranch.label);

        const rawResult = await node({ ...workingBranch.state }, context);
        const result = this.normalizeResult(rawResult);

        if ((result.parallel?.length ?? 0) > 0) {
          throw new Error(
            `Nested parallel workflows are not supported yet (branch "${workingBranch.label}", node "${nodeId}").`
          );
        }

        const statePatch = result.state ?? {};
        workingBranch.state = {
          ...workingBranch.state,
          ...statePatch
        };

        const resolvedEdge = await this.resolveNextNode(nodeId, workingBranch.state, context, result.next);

        const historyEntry: WorkflowHistoryEntry = {
          nodeId,
          startedAt,
          endedAt: new Date().toISOString(),
          status: result.pause ? "paused" : "completed",
          nextNodeId: resolvedEdge.to,
          branch: workingBranch.label,
          parallelGroupId: group.groupId,
          statePatch: Object.keys(statePatch).length > 0 ? { ...statePatch } : undefined,
          output: result.output ? { ...result.output } : undefined,
          pauseReason: result.pauseReason,
          metadata: result.metadata ? { ...result.metadata } : undefined
        };
        historyEntries.push(historyEntry);

        workingBranch.output = result.output
          ? { ...result.output }
          : resolvedEdge.to
          ? undefined
          : { ...workingBranch.state };

        if (result.pause) {
          workingBranch.status = "paused";
          workingBranch.pauseReason = result.pauseReason;
          workingBranch.currentNodeId = resolvedEdge.to;
          return { branch: workingBranch, historyEntries };
        }

        workingBranch.pauseReason = undefined;
        workingBranch.currentNodeId = resolvedEdge.to;

        if (!workingBranch.currentNodeId) {
          workingBranch.status = "completed";
          workingBranch.output = workingBranch.output ?? { ...workingBranch.state };
          return { branch: workingBranch, historyEntries };
        }
      }

      workingBranch.status = "completed";
      workingBranch.output = workingBranch.output ?? { ...workingBranch.state };
      return { branch: workingBranch, historyEntries };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      workingBranch.status = "error";
      workingBranch.error = err.message;

      historyEntries.push({
        nodeId: workingBranch.currentNodeId ?? workingBranch.entryNodeId,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: "error",
        branch: workingBranch.label,
        parallelGroupId: group.groupId,
        error: err.message
      });

      return { branch: workingBranch, historyEntries };
    }
  }

  private async enforceWorkflowGovernance(
    checkpoint: WorkflowCheckpoint,
    nodeId: string,
    state: ChainValues,
    parallelGroupId?: string,
    branchId?: string
  ): Promise<void> {
    const budget = this.consumeBudget("workflow_steps", 1, checkpoint.threadId);
    if (budget && !budget.allowed) {
      await this.auditLogger?.record({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: "workflow.denied.budget",
        status: "warning",
        actorId: this.actor?.id,
        resourceType: "workflow_node",
        resourceId: nodeId,
        message: budget.reason ?? `Budget blocked node "${nodeId}".`,
        details: { workflowId: checkpoint.workflowId, checkpointId: checkpoint.checkpointId, usage: budget.usage }
      });
      throw new Error(budget.reason);
    }

    if (this.actor && this.authorizer) {
      const decision = await this.authorizer.authorize({
        actor: this.actor,
        resourceType: "workflow_node",
        resourceId: nodeId,
        action: "execute",
        metadata: {
          workflowId: checkpoint.workflowId,
          checkpointId: checkpoint.checkpointId,
          parallelGroupId,
          branchId
        }
      });

      if (!decision.allowed) {
        await this.auditLogger?.record({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: "workflow.denied.authorization",
          status: "warning",
          actorId: this.actor.id,
          resourceType: "workflow_node",
          resourceId: nodeId,
          message: decision.reason ?? `Authorization denied for node "${nodeId}".`,
          details: { workflowId: checkpoint.workflowId, checkpointId: checkpoint.checkpointId }
        });
        throw new Error(decision.reason);
      }
    }

    if (this.policyEngine) {
      const decision = await this.policyEngine.evaluate({
        actor: this.actor,
        resourceType: "workflow_node",
        resourceId: nodeId,
        action: "execute",
        state,
        metadata: {
          workflowId: checkpoint.workflowId,
          checkpointId: checkpoint.checkpointId,
          parallelGroupId,
          branchId
        }
      });

      if (!decision.allowed) {
        await this.auditLogger?.record({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: "workflow.denied.policy",
          status: "warning",
          actorId: this.actor?.id,
          resourceType: "workflow_node",
          resourceId: nodeId,
          message: decision.reason ?? `Policy denied node "${nodeId}".`,
          details: { workflowId: checkpoint.workflowId, matchedRuleIds: decision.matchedRuleIds }
        });
        throw new Error(decision.reason);
      }
    }

    await this.auditLogger?.record({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: "workflow.node.executed",
      status: "info",
      actorId: this.actor?.id,
      resourceType: "workflow_node",
      resourceId: nodeId,
      message: `Executing workflow node "${nodeId}".`,
      details: { workflowId: checkpoint.workflowId, checkpointId: checkpoint.checkpointId, parallelGroupId, branchId }
    });
  }

  private createParallelState(
    checkpoint: WorkflowCheckpoint,
    sourceNodeId: string,
    branches: WorkflowParallelBranch[],
    nextNodeId: string | undefined,
    mergeStrategy: WorkflowMergeStrategy,
    namespaceKey?: string
  ): WorkflowParallelState {
    const now = new Date().toISOString();

    return {
      groupId: uuidv4(),
      sourceNodeId,
      nextNodeId,
      mergeStrategy,
      namespaceKey,
      branches: branches.map((branch, index) => ({
        branchId: uuidv4(),
        label: branch.label ?? branch.nodeId ?? `branch_${index + 1}`,
        entryNodeId: branch.nodeId,
        currentNodeId: branch.nodeId,
        status: "running",
        state: {
          ...checkpoint.state,
          ...(branch.state ?? {})
        }
      })),
      startedAt: now,
      updatedAt: now
    };
  }

  private mergeParallelGroup(
    checkpoint: WorkflowCheckpoint,
    group: WorkflowParallelState
  ): void {
    if (group.mergeStrategy === "shallow") {
      for (const branch of group.branches) {
        const value = branch.output ?? branch.state;
        checkpoint.state = {
          ...checkpoint.state,
          ...value
        };
      }
    } else {
      const namespaceKey = group.namespaceKey ?? "parallel";
      const existing =
        checkpoint.state[namespaceKey] && typeof checkpoint.state[namespaceKey] === "object"
          ? (checkpoint.state[namespaceKey] as Record<string, unknown>)
          : {};

      const merged: Record<string, unknown> = { ...existing };
      for (const branch of group.branches) {
        merged[branch.label] = branch.output ?? branch.state;
      }

      checkpoint.state = {
        ...checkpoint.state,
        [namespaceKey]: merged
      };
    }

    checkpoint.pendingParallel = undefined;
    checkpoint.currentNodeId = group.nextNodeId;
    checkpoint.pauseReason = undefined;
    checkpoint.status = "running";
    checkpoint.output = undefined;
  }

  private async resolveNextNode(
    nodeId: string,
    state: ChainValues,
    context: WorkflowNodeContext,
    explicitNext?: string
  ): Promise<{ to?: string; label?: string }> {
    if (explicitNext !== undefined) {
      return { to: explicitNext, label: undefined };
    }

    if (this.graph.isTerminal(nodeId)) {
      return { to: undefined, label: undefined };
    }

    return this.graph.resolveNext(nodeId, state, context);
  }

  private resolveThreadId(initialState: ChainValues, runId: string): string {
    if (typeof initialState["threadId"] === "string" && initialState["threadId"].trim()) {
      return initialState["threadId"];
    }

    if (this.defaultThreadId) {
      return this.defaultThreadId;
    }

    return `workflow-${runId.slice(0, 8)}`;
  }

  private buildContext(
    checkpoint: WorkflowCheckpoint,
    nodeId: string,
    parallelGroupId?: string,
    branchId?: string,
    branchLabel?: string
  ): WorkflowNodeContext {
    return {
      workflowId: checkpoint.workflowId,
      checkpointId: checkpoint.checkpointId,
      threadId: checkpoint.threadId,
      runId: checkpoint.runId,
      nodeId,
      checkpoint: JSON.parse(JSON.stringify(checkpoint)) as WorkflowCheckpoint,
      history: checkpoint.history.map((entry) => ({
        ...entry,
        statePatch: entry.statePatch ? { ...entry.statePatch } : undefined,
        output: entry.output ? { ...entry.output } : undefined,
        metadata: entry.metadata ? { ...entry.metadata } : undefined
      })),
      parallelGroupId,
      branchId,
      branchLabel
    };
  }

  private normalizeResult(
    value: WorkflowNodeResult | ChainValues | void
  ): WorkflowNodeResult {
    if (value === undefined) {
      return {};
    }

    const candidate = value as Record<string, unknown>;
    const controlKeys = [
      "state",
      "next",
      "pause",
      "pauseReason",
      "output",
      "parallel",
      "mergeStrategy",
      "namespaceKey",
      "metadata"
    ];
    const hasControlKeys = controlKeys.some((key) => key in candidate);

    if (hasControlKeys) {
      return value as WorkflowNodeResult;
    }

    return { state: value as ChainValues };
  }

  private checkpointToResult(checkpoint: WorkflowCheckpoint): ChainValues {
    return {
      workflowId: checkpoint.workflowId,
      checkpointId: checkpoint.checkpointId,
      threadId: checkpoint.threadId,
      runId: checkpoint.runId,
      status: checkpoint.status,
      currentNodeId: checkpoint.currentNodeId,
      state: { ...checkpoint.state },
      output: checkpoint.output ? { ...checkpoint.output } : undefined,
      pauseReason: checkpoint.pauseReason,
      error: checkpoint.error,
      pendingParallel: checkpoint.pendingParallel
        ? {
            ...checkpoint.pendingParallel,
            branches: checkpoint.pendingParallel.branches.map((branch) => ({
              ...branch,
              state: { ...branch.state },
              output: branch.output ? { ...branch.output } : undefined
            }))
          }
        : undefined,
      history: checkpoint.history.map((entry) => ({
        ...entry,
        statePatch: entry.statePatch ? { ...entry.statePatch } : undefined,
        output: entry.output ? { ...entry.output } : undefined,
        metadata: entry.metadata ? { ...entry.metadata } : undefined
      }))
    };
  }

  private async saveCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    if (!this.checkpointStore) return;

    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.metadata = {
      ...(this.metadata ?? {}),
      ...(checkpoint.metadata ?? {})
    };

    await this.checkpointStore.save({
      ...checkpoint,
      state: { ...checkpoint.state },
      output: checkpoint.output ? { ...checkpoint.output } : undefined,
      pendingParallel: checkpoint.pendingParallel
        ? {
            ...checkpoint.pendingParallel,
            branches: checkpoint.pendingParallel.branches.map((branch) => ({
              ...branch,
              state: { ...branch.state },
              output: branch.output ? { ...branch.output } : undefined
            }))
          }
        : undefined,
      history: checkpoint.history.map((entry) => ({
        ...entry,
        statePatch: entry.statePatch ? { ...entry.statePatch } : undefined,
        output: entry.output ? { ...entry.output } : undefined,
        metadata: entry.metadata ? { ...entry.metadata } : undefined
      }))
    });
  }

  private async loadCheckpoint(checkpointId: string): Promise<WorkflowCheckpoint> {
    if (!this.checkpointStore) {
      throw new Error("Workflow checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Workflow checkpoint not found: ${checkpointId}`);
    }

    return checkpoint;
  }

  private ensureStepLimit(checkpoint: WorkflowCheckpoint, pendingEntries = 0): void {
    if (checkpoint.history.length + pendingEntries >= this.maxSteps) {
      throw new Error(
        `Workflow "${checkpoint.workflowId}" exceeded the maximum step count of ${this.maxSteps}.`
      );
    }
  }
}
