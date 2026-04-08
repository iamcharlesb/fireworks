import type {
  AgentAction,
  AgentFinish,
  CallbackHandler,
  ChainValues,
  LLMResult
} from "../schema/types";
import { BaseCallbackHandler } from "./base";

export type TraceRunKind = "llm" | "chain" | "tool";
export type TraceRunStatus = "running" | "success" | "error";

export interface TraceEvent {
  type: string;
  runId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface TraceRun {
  runId: string;
  kind: TraceRunKind;
  name: string;
  parentRunId?: string;
  status: TraceRunStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  tokenCount: number;
  children: string[];
  events: TraceEvent[];
}

export interface TraceSummary {
  totalRuns: number;
  rootRuns: number;
  llmRuns: number;
  chainRuns: number;
  toolRuns: number;
  successCount: number;
  errorCount: number;
  runningCount: number;
  totalTokens: number;
}

function extractUsage(result: LLMResult): Record<string, unknown> | undefined {
  if (result.llmOutput?.usage && typeof result.llmOutput.usage === "object") {
    return result.llmOutput.usage as Record<string, unknown>;
  }

  const generationInfo = result.generations[0]?.[0]?.generationInfo;
  if (generationInfo?.usage && typeof generationInfo.usage === "object") {
    return generationInfo.usage as Record<string, unknown>;
  }

  return undefined;
}

/**
 * TracingCallbackHandler — records in-memory run trees with timings, inputs,
 * outputs, errors, and notable agent events.
 */
export class TracingCallbackHandler extends BaseCallbackHandler implements CallbackHandler {
  private runs = new Map<string, TraceRun>();
  private activeStack: string[] = [];

  private startRun(
    kind: TraceRunKind,
    name: string,
    runId: string,
    input?: unknown
  ): void {
    const parentRunId = this.activeStack.at(-1);
    const run: TraceRun = {
      runId,
      kind,
      name,
      parentRunId,
      status: "running",
      startedAt: Date.now(),
      input,
      tokenCount: 0,
      children: [],
      events: []
    };

    this.runs.set(runId, run);
    if (parentRunId) {
      const parent = this.runs.get(parentRunId);
      if (parent) {
        parent.children.push(runId);
      }
    }

    this.activeStack.push(runId);
  }

  private finishRun(runId: string, status: TraceRunStatus, update: Partial<TraceRun> = {}): void {
    const run = this.runs.get(runId);
    if (!run) return;

    const endedAt = Date.now();
    run.status = status;
    run.endedAt = endedAt;
    run.durationMs = endedAt - run.startedAt;

    if (update.output !== undefined) run.output = update.output;
    if (update.error !== undefined) run.error = update.error;

    const stackIndex = this.activeStack.lastIndexOf(runId);
    if (stackIndex !== -1) {
      this.activeStack.splice(stackIndex, 1);
    }
  }

  private recordEvent(type: string, runId: string, data: Record<string, unknown>): void {
    const run = this.runs.get(runId);
    const event: TraceEvent = {
      type,
      runId,
      timestamp: Date.now(),
      data
    };

    if (run) {
      run.events.push(event);
      return;
    }

    const parentRunId = this.activeStack.at(-1);
    if (parentRunId) {
      this.runs.get(parentRunId)?.events.push(event);
    }
  }

  override async onLLMStart(llmName: string, prompts: string[], runId: string): Promise<void> {
    this.startRun("llm", llmName, runId, { prompts });
  }

  override async onLLMEnd(response: LLMResult, runId: string): Promise<void> {
    const usage = extractUsage(response);
    this.finishRun(runId, "success", {
      output: {
        generations: response.generations.flat().length,
        usage
      }
    });
  }

  override async onLLMError(error: Error, runId: string): Promise<void> {
    this.finishRun(runId, "error", { error: error.message });
  }

  override async onLLMNewToken(token: string, runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    run.tokenCount += 1;
    this.recordEvent("llm_token", runId, { token });
  }

  override async onChainStart(chainName: string, inputs: ChainValues, runId: string): Promise<void> {
    this.startRun("chain", chainName, runId, inputs);
  }

  override async onChainEnd(outputs: ChainValues, runId: string): Promise<void> {
    this.finishRun(runId, "success", { output: outputs });
  }

  override async onChainError(error: Error, runId: string): Promise<void> {
    this.finishRun(runId, "error", { error: error.message });
  }

  override async onToolStart(toolName: string, input: string, runId: string): Promise<void> {
    this.startRun("tool", toolName, runId, { input });
  }

  override async onToolEnd(output: string, runId: string): Promise<void> {
    this.finishRun(runId, "success", { output });
  }

  override async onToolError(error: Error, runId: string): Promise<void> {
    this.finishRun(runId, "error", { error: error.message });
  }

  override async onAgentAction(action: AgentAction, runId: string): Promise<void> {
    this.recordEvent("agent_action", runId, {
      tool: action.tool,
      toolInput: action.toolInput,
      log: action.log
    });
  }

  override async onAgentFinish(finish: AgentFinish, runId: string): Promise<void> {
    this.recordEvent("agent_finish", runId, {
      output: finish.returnValues,
      log: finish.log
    });
  }

  getRun(runId: string): TraceRun | undefined {
    const run = this.runs.get(runId);
    return run ? { ...run, children: [...run.children], events: [...run.events] } : undefined;
  }

  getRuns(): TraceRun[] {
    return Array.from(this.runs.values()).map((run) => ({
      ...run,
      children: [...run.children],
      events: [...run.events]
    }));
  }

  getRootRuns(): TraceRun[] {
    return this.getRuns().filter((run) => !run.parentRunId);
  }

  clear(): void {
    this.runs.clear();
    this.activeStack = [];
  }

  getSummary(): TraceSummary {
    const runs = this.getRuns();

    return {
      totalRuns: runs.length,
      rootRuns: runs.filter((run) => !run.parentRunId).length,
      llmRuns: runs.filter((run) => run.kind === "llm").length,
      chainRuns: runs.filter((run) => run.kind === "chain").length,
      toolRuns: runs.filter((run) => run.kind === "tool").length,
      successCount: runs.filter((run) => run.status === "success").length,
      errorCount: runs.filter((run) => run.status === "error").length,
      runningCount: runs.filter((run) => run.status === "running").length,
      totalTokens: runs.reduce((sum, run) => sum + run.tokenCount, 0)
    };
  }

  printSummary(): void {
    const summary = this.getSummary();
    console.log("Trace summary:", summary);
  }
}
