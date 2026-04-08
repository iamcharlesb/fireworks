// ============================================================
// Fireworks++ — LoggingCallbackHandler
// Logs all lifecycle events to the console with timestamps and
// configurable log levels.
// ============================================================

import type { LLMResult, ChainValues, AgentAction, AgentFinish } from "../schema/types";
import { BaseCallbackHandler } from "./base";

export interface LoggingCallbackHandlerOptions {
  /** Minimum severity level to emit. Defaults to "info". */
  level?: "debug" | "info" | "warn";
  /** Optional prefix prepended to every log line. */
  prefix?: string;
}

type LogLevel = "debug" | "info" | "warn";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2 };

/**
 * LoggingCallbackHandler emits structured, timestamped log lines for every
 * lifecycle event in the Fireworks++ execution pipeline.
 */
export class LoggingCallbackHandler extends BaseCallbackHandler {
  private level: LogLevel;
  private prefix: string;

  constructor(options: LoggingCallbackHandlerOptions = {}) {
    super();
    this.level = options.level ?? "info";
    this.prefix = options.prefix ?? "[Fireworks++]";
  }

  // ------------------------------------------------------------------ helpers

  private ts(): string {
    return new Date().toISOString();
  }

  private shouldLog(msgLevel: LogLevel): boolean {
    return LEVEL_RANK[msgLevel] >= LEVEL_RANK[this.level];
  }

  private emit(msgLevel: LogLevel, category: string, message: string): void {
    if (!this.shouldLog(msgLevel)) return;

    const line = `${this.ts()} ${this.prefix} [${category.toUpperCase()}] ${message}`;

    if (msgLevel === "warn") {
      console.warn(line);
    } else if (msgLevel === "debug") {
      console.debug(line);
    } else {
      console.log(line);
    }
  }

  private truncate(text: string, maxLen = 120): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}…`;
  }

  // ------------------------------------------------------------------ LLM

  override async onLLMStart(llmName: string, prompts: string[], runId: string): Promise<void> {
    this.emit(
      "debug",
      "llm:start",
      `model="${llmName}" prompts=${prompts.length} runId=${runId}`
    );
  }

  override async onLLMEnd(response: LLMResult, runId: string): Promise<void> {
    const gens = response.generations.flat().length;
    this.emit("info", "llm:end", `generations=${gens} runId=${runId}`);
  }

  override async onLLMError(error: Error, runId: string): Promise<void> {
    this.emit("warn", "llm:error", `message="${error.message}" runId=${runId}`);
  }

  override async onLLMNewToken(token: string, runId: string): Promise<void> {
    this.emit("debug", "llm:token", `token=${JSON.stringify(token)} runId=${runId}`);
  }

  // ------------------------------------------------------------------ Chain

  override async onChainStart(chainName: string, inputs: ChainValues, runId: string): Promise<void> {
    const keys = Object.keys(inputs).join(", ");
    this.emit("info", "chain:start", `chain="${chainName}" inputKeys=[${keys}] runId=${runId}`);
  }

  override async onChainEnd(outputs: ChainValues, runId: string): Promise<void> {
    const keys = Object.keys(outputs).join(", ");
    this.emit("info", "chain:end", `outputKeys=[${keys}] runId=${runId}`);
  }

  override async onChainError(error: Error, runId: string): Promise<void> {
    this.emit("warn", "chain:error", `message="${error.message}" runId=${runId}`);
  }

  // ------------------------------------------------------------------ Tool

  override async onToolStart(toolName: string, input: string, runId: string): Promise<void> {
    this.emit(
      "info",
      "tool:start",
      `tool="${toolName}" input="${this.truncate(input)}" runId=${runId}`
    );
  }

  override async onToolEnd(output: string, runId: string): Promise<void> {
    this.emit(
      "info",
      "tool:end",
      `output="${this.truncate(output)}" runId=${runId}`
    );
  }

  override async onToolError(error: Error, runId: string): Promise<void> {
    this.emit("warn", "tool:error", `message="${error.message}" runId=${runId}`);
  }

  // ------------------------------------------------------------------ Agent

  override async onAgentAction(action: AgentAction, runId: string): Promise<void> {
    this.emit(
      "info",
      "agent:action",
      `tool="${action.tool}" input="${this.truncate(action.toolInput)}" runId=${runId}`
    );
  }

  override async onAgentFinish(finish: AgentFinish, runId: string): Promise<void> {
    const outputStr = this.truncate(JSON.stringify(finish.returnValues));
    this.emit("info", "agent:finish", `output=${outputStr} runId=${runId}`);
  }
}
