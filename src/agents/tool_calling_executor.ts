import { uuidv4 } from "../utils/uuid";
import type {
  AgentCheckpoint,
  ApprovalRequest,
  CheckpointStore,
  WorkflowEventType
} from "../checkpoints/base";
import type {
  AuditLogger,
  AuthorizationProvider,
  BudgetController,
  GovernanceActor,
  PolicyProvider,
  ScopedBudgetController
} from "../governance";
import type {
  AgentAction,
  AgentFinish,
  CallbackHandler,
  ChainValues,
  ExecutorOptions,
  IntermediateStep,
  Message,
  ToolCall
} from "../schema/types";
import type { BaseTool } from "../tools/base";
import { ToolCallingAgent } from "./tool_calling_agent";

export type ApprovalRequirement =
  | boolean
  | string[]
  | ((action: AgentAction, checkpoint: AgentCheckpoint) => boolean | Promise<boolean>);

export interface ApprovalDecision {
  reviewer?: string;
  reason?: string;
}

export interface ToolCallingExecutorConfig extends ExecutorOptions {
  checkpointStore?: CheckpointStore;
  threadId?: string;
  checkpointMetadata?: Record<string, unknown>;
  requireApproval?: ApprovalRequirement;
  actor?: GovernanceActor;
  authorizer?: AuthorizationProvider;
  policyEngine?: PolicyProvider;
  budgetManager?: BudgetController;
  auditLogger?: AuditLogger;
}

/**
 * ToolCallingAgentExecutor — runs a provider-native tool-calling loop.
 *
 * The model decides when to call tools via its native tool-calling API.
 * The executor runs those tools, appends tool result messages, and loops until
 * the model responds with a final answer.
 */
export class ToolCallingAgentExecutor {
  private toolMap: Map<string, BaseTool>;
  private maxIterations: number;
  private returnIntermediateSteps: boolean;
  private earlyStoppingMethod: "force" | "generate";
  private verbose: boolean;
  private checkpointStore?: CheckpointStore;
  private defaultThreadId?: string;
  private checkpointMetadata?: Record<string, unknown>;
  private requireApproval?: ApprovalRequirement;
  private actor?: GovernanceActor;
  private authorizer?: AuthorizationProvider;
  private policyEngine?: PolicyProvider;
  private budgetManager?: BudgetController;
  private auditLogger?: AuditLogger;

  constructor(
    private agent: ToolCallingAgent,
    options: ToolCallingExecutorConfig = {}
  ) {
    this.toolMap = new Map(agent.getTools().map((tool) => [tool.name, tool]));
    this.maxIterations = options.maxIterations ?? 15;
    this.returnIntermediateSteps = options.returnIntermediateSteps ?? false;
    this.earlyStoppingMethod = options.earlyStoppingMethod ?? "generate";
    this.verbose = options.verbose ?? false;
    this.checkpointStore = options.checkpointStore;
    this.defaultThreadId = options.threadId;
    this.checkpointMetadata = options.checkpointMetadata;
    this.requireApproval = options.requireApproval;
    this.actor = options.actor;
    this.authorizer = options.authorizer;
    this.policyEngine = options.policyEngine;
    this.budgetManager = options.budgetManager;
    this.auditLogger = options.auditLogger;
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

  async call(
    inputs: ChainValues,
    callbacks: CallbackHandler[] = []
  ): Promise<ChainValues> {
    const runId = uuidv4();
    const threadId = this.resolveThreadId(inputs, runId);
    const messages = await this.agent.buildInitialMessages(inputs);
    const now = new Date().toISOString();
    const checkpoint: AgentCheckpoint = {
      checkpointId: uuidv4(),
      threadId,
      runId,
      agentType: this.agent.agentType,
      status: "running",
      iteration: 0,
      maxIterations: this.maxIterations,
      input: { ...inputs },
      messages,
      intermediateSteps: [],
      workflow: [],
      metadata: this.checkpointMetadata ? { ...this.checkpointMetadata } : undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.auditLogger?.record({
      id: runId,
      timestamp: now,
      type: "agent.run.started",
      status: "info",
      actorId: this.actor?.id,
      resourceType: "agent",
      resourceId: this.agent.agentType,
      message: `Started tool-calling agent run on thread "${threadId}".`,
      details: { threadId }
    });

    return this.execute(checkpoint, callbacks);
  }

  async resume(threadId: string, callbacks: CallbackHandler[] = []): Promise<ChainValues> {
    if (!this.checkpointStore) {
      throw new Error("Checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.getLatest(threadId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for thread: ${threadId}`);
    }

    return this.resumeFromCheckpoint(checkpoint.checkpointId, callbacks);
  }

  async resumeFromCheckpoint(
    checkpointId: string,
    callbacks: CallbackHandler[] = []
  ): Promise<ChainValues> {
    if (!this.checkpointStore) {
      throw new Error("Checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    if (checkpoint.status === "completed") {
      return this.checkpointToResult(checkpoint);
    }

    if (checkpoint.status === "waiting_for_approval" && checkpoint.approval?.status === "pending") {
      return this.checkpointToResult(checkpoint);
    }

    checkpoint.status = "running";
    checkpoint.error = undefined;
    await this.auditLogger?.record({
      id: checkpoint.runId,
      timestamp: new Date().toISOString(),
      type: "agent.run.resumed",
      status: "info",
      actorId: this.actor?.id,
      resourceType: "agent",
      resourceId: this.agent.agentType,
      message: `Resumed agent checkpoint "${checkpoint.checkpointId}".`,
      details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
    });
    return this.execute(checkpoint, callbacks);
  }

  async approve(
    threadId: string,
    decision: ApprovalDecision = {}
  ): Promise<ChainValues> {
    if (!this.checkpointStore) {
      throw new Error("Checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.getLatest(threadId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for thread: ${threadId}`);
    }

    return this.approveCheckpoint(checkpoint.checkpointId, decision);
  }

  async approveCheckpoint(
    checkpointId: string,
    decision: ApprovalDecision = {}
  ): Promise<ChainValues> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    this.ensureApprovalPending(checkpoint);

    checkpoint.approval = {
      ...checkpoint.approval!,
      status: "approved",
      reviewer: decision.reviewer,
      reason: decision.reason,
      resolvedAt: new Date().toISOString()
    };
    this.recordWorkflowEvent(checkpoint, "approval_resolved", {
      tool: checkpoint.approval.action.tool,
      status: "approved",
      reviewer: decision.reviewer
    });
    await this.auditLogger?.record({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: "tool.approval.resolved",
      status: "success",
      actorId: decision.reviewer ?? this.actor?.id,
      resourceType: "tool",
      resourceId: checkpoint.approval.action.tool,
      message: `Approved tool "${checkpoint.approval.action.tool}".`,
      details: { checkpointId: checkpoint.checkpointId, reason: decision.reason }
    });
    await this.saveCheckpoint(checkpoint, { stage: "approval_approved" });
    return this.checkpointToResult(checkpoint);
  }

  async reject(
    threadId: string,
    decision: ApprovalDecision = {}
  ): Promise<ChainValues> {
    if (!this.checkpointStore) {
      throw new Error("Checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.getLatest(threadId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for thread: ${threadId}`);
    }

    return this.rejectCheckpoint(checkpoint.checkpointId, decision);
  }

  async rejectCheckpoint(
    checkpointId: string,
    decision: ApprovalDecision = {}
  ): Promise<ChainValues> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    this.ensureApprovalPending(checkpoint);

    checkpoint.approval = {
      ...checkpoint.approval!,
      status: "rejected",
      reviewer: decision.reviewer,
      reason: decision.reason,
      resolvedAt: new Date().toISOString()
    };
    this.recordWorkflowEvent(checkpoint, "approval_resolved", {
      tool: checkpoint.approval.action.tool,
      status: "rejected",
      reviewer: decision.reviewer
    });
    await this.auditLogger?.record({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: "tool.approval.resolved",
      status: "warning",
      actorId: decision.reviewer ?? this.actor?.id,
      resourceType: "tool",
      resourceId: checkpoint.approval.action.tool,
      message: `Rejected tool "${checkpoint.approval.action.tool}".`,
      details: { checkpointId: checkpoint.checkpointId, reason: decision.reason }
    });
    await this.saveCheckpoint(checkpoint, { stage: "approval_rejected" });
    return this.checkpointToResult(checkpoint);
  }

  async run(input: string, callbacks: CallbackHandler[] = []): Promise<string> {
    const result = await this.call({ input }, callbacks);
    const output = result["output"];
    return typeof output === "string" ? output : String(output ?? "");
  }

  private async execute(
    checkpoint: AgentCheckpoint,
    callbacks: CallbackHandler[]
  ): Promise<ChainValues> {
    try {
      const runBudget = this.consumeBudget("agent_runs", checkpoint.iteration === 0 ? 1 : 0, checkpoint.threadId);
      if (runBudget && !runBudget.allowed) {
        throw new Error(runBudget.reason);
      }

      if (this.verbose) {
        console.log(
          `[ToolCallingAgentExecutor] Starting run ${checkpoint.runId} on thread ${checkpoint.threadId}`
        );
      }

      this.recordWorkflowEvent(
        checkpoint,
        checkpoint.iteration > 0 ? "resumed" : "started",
        { threadId: checkpoint.threadId }
      );
      await this.saveCheckpoint(checkpoint, {
        stage: checkpoint.iteration > 0 ? "resumed" : "started"
      });

      while (checkpoint.iteration < this.maxIterations) {
        if ((checkpoint.pendingToolCalls?.length ?? 0) > 0) {
          const paused = await this.executePendingToolCalls(checkpoint, callbacks);
          if (paused) {
            return this.checkpointToResult(checkpoint);
          }
          checkpoint.iteration += 1;
          await this.saveCheckpoint(checkpoint, {
            stage: "tool_results",
            completedIterations: checkpoint.iteration
          });
          continue;
        }

        const assistant = await this.agent.next(checkpoint.messages);
        checkpoint.messages.push({
          role: "ai",
          content: assistant.content,
          toolCalls: assistant.toolCalls
        });
        this.recordWorkflowEvent(checkpoint, "assistant", {
          pendingToolCalls: assistant.toolCalls?.length ?? 0
        });

        const toolCalls = assistant.toolCalls ?? [];
        if (toolCalls.length === 0) {
          checkpoint.iteration += 1;
          return this.finish(checkpoint, assistant.content, callbacks);
        }

        if (this.verbose) {
          console.log(
            `[ToolCallingAgentExecutor] Iteration ${checkpoint.iteration + 1}: ${toolCalls.length} tool call(s)`
          );
        }

        checkpoint.pendingToolCalls = toolCalls.map((toolCall) => ({ ...toolCall }));
        await this.saveCheckpoint(checkpoint, {
          stage: "assistant",
          pendingToolCalls: checkpoint.pendingToolCalls.length
        });
      }

      if (this.earlyStoppingMethod === "generate") {
        try {
          const forced = await this.agent.next(checkpoint.messages, { toolChoice: "none" });
          checkpoint.iteration += 1;
          return this.finish(checkpoint, forced.content, callbacks);
        } catch {
          // Fall through to force-stop output
        }
      }

      return this.finish(
        checkpoint,
        "Agent stopped due to reaching the maximum number of iterations.",
        callbacks
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      checkpoint.status = "error";
      checkpoint.error = err.message;
      this.recordWorkflowEvent(checkpoint, "error", { message: err.message });
      await this.auditLogger?.record({
        id: checkpoint.runId,
        timestamp: new Date().toISOString(),
        type: "agent.run.error",
        status: "error",
        actorId: this.actor?.id,
        resourceType: "agent",
        resourceId: this.agent.agentType,
        message: err.message,
        details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
      });
      await this.saveCheckpoint(checkpoint, { stage: "error" });
      throw err;
    }
  }

  private async executePendingToolCalls(
    checkpoint: AgentCheckpoint,
    callbacks: CallbackHandler[]
  ): Promise<boolean> {
    while ((checkpoint.pendingToolCalls?.length ?? 0) > 0) {
      const toolCall = checkpoint.pendingToolCalls![0];
      const { action } = this.buildPendingAction(checkpoint, toolCall);

      const approvalPause = await this.maybePauseForApproval(checkpoint, action, toolCall);
      if (approvalPause) {
        return true;
      }

      const governanceObservation = await this.evaluateGovernance(action, checkpoint);
      if (governanceObservation) {
        checkpoint.intermediateSteps.push({ action, observation: governanceObservation });
        checkpoint.messages.push({
          role: "tool",
          content: governanceObservation,
          toolCallId: toolCall.id
        });
        checkpoint.pendingToolCalls = checkpoint.pendingToolCalls!.slice(1);
        checkpoint.approval = undefined;
        this.recordWorkflowEvent(checkpoint, "tool_result", {
          tool: action.tool,
          allowed: false
        });
        await this.saveCheckpoint(checkpoint, {
          stage: "tool_result",
          lastTool: action.tool,
          pendingToolCalls: checkpoint.pendingToolCalls.length
        });
        continue;
      }

      if (checkpoint.approval?.status === "rejected") {
        const observation = this.createRejectedObservation(checkpoint.approval);
        checkpoint.intermediateSteps.push({ action, observation });
        checkpoint.messages.push({
          role: "tool",
          content: observation,
          toolCallId: toolCall.id
        });
        checkpoint.pendingToolCalls = checkpoint.pendingToolCalls!.slice(1);
        checkpoint.approval = undefined;
        this.recordWorkflowEvent(checkpoint, "tool_result", {
          tool: action.tool,
          approved: false
        });
        await this.saveCheckpoint(checkpoint, {
          stage: "tool_result",
          lastTool: action.tool,
          pendingToolCalls: checkpoint.pendingToolCalls.length
        });
        continue;
      }

      for (const cb of callbacks) {
        await cb.onAgentAction?.(action, checkpoint.runId);
      }

      const observation = await this.runTool(action, callbacks);
      checkpoint.intermediateSteps.push({ action, observation });
      checkpoint.messages.push({
        role: "tool",
        content: observation,
        toolCallId: toolCall.id
      });
      checkpoint.pendingToolCalls = checkpoint.pendingToolCalls!.slice(1);
      checkpoint.approval = undefined;
      this.recordWorkflowEvent(checkpoint, "tool_result", {
        tool: action.tool,
        approved: true
      });
      await this.auditLogger?.record({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: "tool.executed",
        status: "success",
        actorId: this.actor?.id,
        resourceType: "tool",
        resourceId: action.tool,
        message: `Executed tool "${action.tool}".`,
        details: { toolInput: action.toolInput, checkpointId: checkpoint.checkpointId }
      });

      await this.saveCheckpoint(checkpoint, {
        stage: "tool_result",
        lastTool: action.tool,
          pendingToolCalls: checkpoint.pendingToolCalls.length
      });
    }

    return false;
  }

  private buildPendingAction(
    checkpoint: AgentCheckpoint,
    toolCall: ToolCall
  ): { assistant: Message; action: AgentAction } {
    const assistant = this.findLatestAssistantMessage(checkpoint.messages);
    const action = this.toAgentAction(toolCall, assistant);
    return { assistant, action };
  }

  private findLatestAssistantMessage(messages: Message[]): Message {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === "ai") {
        return message;
      }
    }

    return { role: "ai", content: "" };
  }

  private resolveThreadId(inputs: ChainValues, runId: string): string {
    if (typeof inputs["threadId"] === "string" && inputs["threadId"].trim()) {
      return inputs["threadId"];
    }

    if (this.defaultThreadId) {
      return this.defaultThreadId;
    }

    return `thread-${runId.slice(0, 8)}`;
  }

  private async finish(
    checkpoint: AgentCheckpoint,
    output: string,
    callbacks: CallbackHandler[]
  ): Promise<ChainValues> {
    await this.agent.saveContext(checkpoint.input, output);

    const finish: AgentFinish = {
      returnValues: { output },
      log: output
    };
    for (const cb of callbacks) {
      await cb.onAgentFinish?.(finish, checkpoint.runId);
    }

    checkpoint.status = "completed";
    checkpoint.output = output;
    checkpoint.error = undefined;
    checkpoint.pendingToolCalls = [];
    checkpoint.approval = undefined;
    this.recordWorkflowEvent(checkpoint, "completed", {
      outputLength: output.length
    });
    await this.auditLogger?.record({
      id: checkpoint.runId,
      timestamp: new Date().toISOString(),
      type: "agent.run.completed",
      status: "success",
      actorId: this.actor?.id,
      resourceType: "agent",
      resourceId: this.agent.agentType,
      message: "Completed tool-calling agent run.",
      details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
    });
    await this.saveCheckpoint(checkpoint, { stage: "completed" });

    return this.checkpointToResult(checkpoint);
  }

  private toAgentAction(toolCall: ToolCall, assistant: Message): AgentAction {
    return {
      tool: toolCall.name,
      toolInput: this.extractToolInput(toolCall.arguments),
      log: assistant.content || `Tool call: ${toolCall.name}`,
      messageLog: [assistant]
    };
  }

  private extractToolInput(argumentsText: string): string {
    try {
      const parsed = JSON.parse(argumentsText) as unknown;

      if (typeof parsed === "string") {
        return parsed;
      }

      if (typeof parsed === "number" || typeof parsed === "boolean") {
        return String(parsed);
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if ("input" in record) {
          const input = record["input"];
          return typeof input === "string" ? input : JSON.stringify(input);
        }

        const keys = Object.keys(record);
        if (keys.length === 1) {
          const value = record[keys[0]];
          return typeof value === "string" ? value : JSON.stringify(value);
        }
      }

      return JSON.stringify(parsed);
    } catch {
      return argumentsText;
    }
  }

  private async runTool(
    action: AgentAction,
    callbacks: CallbackHandler[]
  ): Promise<string> {
    const tool = this.toolMap.get(action.tool);
    if (!tool) {
      return `Tool "${action.tool}" not found. Available tools: ${[...this.toolMap.keys()].join(", ")}`;
    }

    try {
      return await tool.run(action.toolInput, callbacks);
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return `Tool error: ${err}`;
    }
  }

  private checkpointToResult(checkpoint: AgentCheckpoint): ChainValues {
    const workflow = checkpoint.workflow ?? [];
    const result: ChainValues = {
      output: checkpoint.output ?? ""
    };

    if (this.returnIntermediateSteps) {
      result["intermediateSteps"] = checkpoint.intermediateSteps.map((step) => [
        step.action,
        step.observation
      ]);
    }

    result["status"] = checkpoint.status;

    if (this.checkpointStore) {
      result["checkpointId"] = checkpoint.checkpointId;
      result["threadId"] = checkpoint.threadId;
      result["runId"] = checkpoint.runId;
    }

    if (checkpoint.approval) {
      result["approval"] = { ...checkpoint.approval };
    }

    result["workflow"] = workflow.map((event) => ({
      ...event,
      data: event.data ? { ...event.data } : undefined
    }));

    return result;
  }

  private async saveCheckpoint(
    checkpoint: AgentCheckpoint,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.checkpointStore) return;

    checkpoint.workflow = checkpoint.workflow ?? [];
    checkpoint.updatedAt = new Date().toISOString();
    checkpoint.metadata = {
      ...(this.checkpointMetadata ?? {}),
      ...(checkpoint.metadata ?? {}),
      ...(metadata ?? {})
    };

    await this.checkpointStore.save({
      ...checkpoint,
      input: { ...checkpoint.input },
      messages: checkpoint.messages.map((message) => ({
        ...message,
        toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall }))
      })),
      intermediateSteps: checkpoint.intermediateSteps.map((step: IntermediateStep) => ({
        action: {
          ...step.action,
          messageLog: step.action.messageLog?.map((message) => ({
            ...message,
            toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall }))
          }))
        },
        observation: step.observation
      })),
      approval: checkpoint.approval
        ? {
            ...checkpoint.approval,
            toolCall: { ...checkpoint.approval.toolCall },
            action: {
              ...checkpoint.approval.action,
              messageLog: checkpoint.approval.action.messageLog?.map((message) => ({
                ...message,
                toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall }))
              }))
            }
          }
        : undefined,
      workflow: checkpoint.workflow.map((event) => ({
        ...event,
        data: event.data ? { ...event.data } : undefined
      })),
      pendingToolCalls: checkpoint.pendingToolCalls?.map((toolCall) => ({ ...toolCall }))
    });
  }

  private async maybePauseForApproval(
    checkpoint: AgentCheckpoint,
    action: AgentAction,
    toolCall: ToolCall
  ): Promise<boolean> {
    if (!(await this.needsApproval(action, checkpoint))) {
      return false;
    }

    if (!checkpoint.approval) {
      checkpoint.status = "waiting_for_approval";
      checkpoint.approval = {
        toolCall: { ...toolCall },
        action: {
          ...action,
          messageLog: action.messageLog?.map((message) => ({
            ...message,
            toolCalls: message.toolCalls?.map((item) => ({ ...item }))
          }))
        },
        status: "pending",
        requestedAt: new Date().toISOString()
      };
      this.recordWorkflowEvent(checkpoint, "approval_requested", {
        tool: action.tool
      });
      await this.auditLogger?.record({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: "tool.approval.requested",
        status: "warning",
        actorId: this.actor?.id,
        resourceType: "tool",
        resourceId: action.tool,
        message: `Approval required for tool "${action.tool}".`,
        details: { checkpointId: checkpoint.checkpointId, threadId: checkpoint.threadId }
      });
      await this.saveCheckpoint(checkpoint, {
        stage: "approval_requested",
        tool: action.tool
      });
      return true;
    }

    if (checkpoint.approval.status === "pending") {
      checkpoint.status = "waiting_for_approval";
      await this.saveCheckpoint(checkpoint, { stage: "approval_requested", tool: action.tool });
      return true;
    }

    checkpoint.status = "running";
    return false;
  }

  private async evaluateGovernance(
    action: AgentAction,
    checkpoint: AgentCheckpoint
  ): Promise<string | undefined> {
    const budget = this.consumeBudget("tool_calls", 1, checkpoint.threadId);
    if (budget && !budget.allowed) {
      await this.auditLogger?.record({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        type: "tool.denied.budget",
        status: "warning",
        actorId: this.actor?.id,
        resourceType: "tool",
        resourceId: action.tool,
        message: budget.reason ?? `Budget blocked tool "${action.tool}".`,
        details: { usage: budget.usage, checkpointId: checkpoint.checkpointId }
      });
      return `Governance denied tool "${action.tool}": ${budget.reason}`;
    }

    if (this.actor && this.authorizer) {
      const decision = await this.authorizer.authorize({
        actor: this.actor,
        resourceType: "tool",
        resourceId: action.tool,
        action: "execute",
        metadata: {
          toolInput: action.toolInput,
          checkpointId: checkpoint.checkpointId
        }
      });

      if (!decision.allowed) {
        await this.auditLogger?.record({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: "tool.denied.authorization",
          status: "warning",
          actorId: this.actor.id,
          resourceType: "tool",
          resourceId: action.tool,
          message: decision.reason ?? `Authorization denied for tool "${action.tool}".`,
          details: { checkpointId: checkpoint.checkpointId }
        });
        return `Governance denied tool "${action.tool}": ${decision.reason}`;
      }
    }

    if (this.policyEngine) {
      const decision = await this.policyEngine.evaluate({
        actor: this.actor,
        resourceType: "tool",
        resourceId: action.tool,
        action: "execute",
        inputs: checkpoint.input,
        metadata: {
          toolInput: action.toolInput,
          checkpointId: checkpoint.checkpointId,
          threadId: checkpoint.threadId
        }
      });

      if (!decision.allowed) {
        await this.auditLogger?.record({
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          type: "tool.denied.policy",
          status: "warning",
          actorId: this.actor?.id,
          resourceType: "tool",
          resourceId: action.tool,
          message: decision.reason ?? `Policy denied tool "${action.tool}".`,
          details: { checkpointId: checkpoint.checkpointId, matchedRuleIds: decision.matchedRuleIds }
        });
        return `Governance denied tool "${action.tool}": ${decision.reason}`;
      }
    }

    return undefined;
  }

  private async needsApproval(
    action: AgentAction,
    checkpoint: AgentCheckpoint
  ): Promise<boolean> {
    if (this.requireApproval === undefined || this.requireApproval === false) {
      return false;
    }

    if (this.requireApproval === true) {
      return true;
    }

    if (Array.isArray(this.requireApproval)) {
      return this.requireApproval.includes(action.tool);
    }

    return this.requireApproval(action, checkpoint);
  }

  private createRejectedObservation(approval: ApprovalRequest): string {
    const reason = approval.reason ? ` Reason: ${approval.reason}` : "";
    return `Tool "${approval.action.tool}" was rejected by a reviewer.${reason}`;
  }

  private recordWorkflowEvent(
    checkpoint: AgentCheckpoint,
    type: WorkflowEventType,
    data?: Record<string, unknown>
  ): void {
    checkpoint.workflow = checkpoint.workflow ?? [];
    checkpoint.workflow.push({
      type,
      timestamp: new Date().toISOString(),
      iteration: checkpoint.iteration,
      data
    });
  }

  private async loadCheckpoint(checkpointId: string): Promise<AgentCheckpoint> {
    if (!this.checkpointStore) {
      throw new Error("Checkpoint store is not configured on this executor.");
    }

    const checkpoint = await this.checkpointStore.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    return checkpoint;
  }

  private ensureApprovalPending(checkpoint: AgentCheckpoint): void {
    if (checkpoint.status !== "waiting_for_approval" || !checkpoint.approval) {
      throw new Error(`Checkpoint ${checkpoint.checkpointId} is not waiting for approval.`);
    }

    if (checkpoint.approval.status !== "pending") {
      throw new Error(`Checkpoint ${checkpoint.checkpointId} approval is already resolved.`);
    }
  }
}
