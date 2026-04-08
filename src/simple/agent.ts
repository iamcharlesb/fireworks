import path from "path";
import { ToolCallingAgent } from "../agents/tool_calling_agent";
import type { ApprovalRequirement, ToolCallingExecutorConfig } from "../agents/tool_calling_executor";
import { ToolCallingAgentExecutor } from "../agents/tool_calling_executor";
import type { BaseChatModel, BaseChatModelConfig } from "../chat_models/base";
import { ChatAnthropic } from "../chat_models/anthropic";
import { ChatGemini } from "../chat_models/gemini";
import { ChatOllama } from "../chat_models/ollama";
import { ChatOpenAI } from "../chat_models/openai";
import { ChatPerplexity } from "../chat_models/perplexity";
import { FileCheckpointStore } from "../checkpoints";
import type { CheckpointStore } from "../checkpoints";
import { FileAuditLogger } from "../governance/audit";
import type {
  AuditLogger,
  AuthorizationProvider,
  BudgetController,
  BudgetLimit,
  GovernanceActor,
  GovernanceRole,
  GovernanceRule,
  PolicyProvider,
  ScopedBudgetLimit
} from "../governance";
import { BudgetManager, GovernanceBudgetHandler, PolicyEngine, RBACAuthorizer, ScopedBudgetManager } from "../governance";
import { loadMonitoringSnapshot, renderMonitoringDashboardHtml, AlertManager } from "../monitoring";
import type { MonitoringAlert, MonitoringSnapshot } from "../monitoring";
import type { MCPClient } from "../mcp";
import type { BaseMemory } from "../memory/base";
import type { CallbackHandler, ChainValues, ToolChoice, ToolResult } from "../schema/types";
import { ManagementServer, type ManagementServerConfig } from "../server";
import { BaseTool, DynamicTool } from "../tools/base";

export type SimpleProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "perplexity"
  | "ollama";

export type SimpleToolHandler =
  | ((input: string) => Promise<string | ToolResult> | string | ToolResult);

export interface SimpleToolConfig {
  description?: string;
  handler: SimpleToolHandler;
  returnDirect?: boolean;
}

export type SimpleToolDefinition = BaseTool | SimpleToolHandler | SimpleToolConfig;

export interface SimpleMonitoringConfig {
  rootDir?: string;
  auditPath?: string;
  checkpointDir?: string;
  workflowDir?: string;
}

export interface SimpleGovernanceConfig {
  actor?: GovernanceActor;
  roles?: GovernanceRole[];
  authorizer?: AuthorizationProvider;
  rules?: GovernanceRule[];
  policyEngine?: PolicyProvider;
  budgets?: BudgetController | BudgetLimit[];
  scopedBudgets?: ScopedBudgetLimit[];
  auditLogger?: AuditLogger;
  requireApproval?: ApprovalRequirement;
}

export interface CreateAgentConfig extends BaseChatModelConfig {
  provider?: SimpleProvider;
  chatModel?: BaseChatModel;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  anthropicVersion?: string;
  tools?: BaseTool[] | Record<string, SimpleToolDefinition>;
  systemPrompt?: string;
  toolChoice?: ToolChoice;
  memory?: BaseMemory;
  threadId?: string;
  checkpointStore?: CheckpointStore;
  callbacks?: CallbackHandler[];
  verbose?: boolean;
  maxIterations?: number;
  earlyStoppingMethod?: ToolCallingExecutorConfig["earlyStoppingMethod"];
  monitoring?: SimpleMonitoringConfig;
  governance?: SimpleGovernanceConfig;
}

export interface SimpleAskOptions {
  threadId?: string;
  callbacks?: CallbackHandler[];
}

export interface SimpleAskResult extends ChainValues {
  text: string;
}

export interface SimpleDashboardOptions {
  html?: boolean;
  writeTo?: string;
}

function normalizeToolResult(result: string | ToolResult): ToolResult {
  return typeof result === "string" ? { output: result } : result;
}

function isSimpleToolConfig(value: SimpleToolDefinition): value is SimpleToolConfig {
  return typeof value === "object" && value !== null && "handler" in value;
}

function inferProvider(config: CreateAgentConfig): SimpleProvider {
  if (config.provider) return config.provider;
  if (process.env.OPENAI_API_KEY || config.organization) return "openai";
  if (process.env.ANTHROPIC_API_KEY || config.anthropicVersion) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.PERPLEXITY_API_KEY) return "perplexity";
  return "ollama";
}

function defaultDescription(name: string): string {
  return `Run the ${name} tool.`;
}

function normalizeTool(name: string, definition: SimpleToolDefinition): BaseTool {
  if (definition instanceof BaseTool) {
    return definition;
  }

  const config = isSimpleToolConfig(definition)
    ? definition
    : {
        handler: definition,
        description: defaultDescription(name)
      };

  return new DynamicTool({
    name,
    description: config.description ?? defaultDescription(name),
    returnDirect: config.returnDirect,
    func: async (input) => normalizeToolResult(await config.handler(input))
  });
}

export class SimpleAgent {
  private provider?: SimpleProvider;
  private chatModel?: BaseChatModel;
  private apiKey?: string;
  private model?: string;
  private baseUrl?: string;
  private organization?: string;
  private anthropicVersion?: string;
  private callbacks: CallbackHandler[];
  private verbose: boolean;
  private systemPrompt?: string;
  private toolChoice?: ToolChoice;
  private memory?: BaseMemory;
  private defaultThreadId?: string;
  private maxIterations?: number;
  private earlyStoppingMethod?: ToolCallingExecutorConfig["earlyStoppingMethod"];
  private checkpointStore?: CheckpointStore;
  private tools: BaseTool[] = [];
  private actor?: GovernanceActor;
  private authorizer?: AuthorizationProvider;
  private policyEngine?: PolicyProvider;
  private budgetManager?: BudgetController;
  private auditLogger: AuditLogger;
  private requireApproval?: ApprovalRequirement;
  private monitoring: Required<SimpleMonitoringConfig>;

  constructor(config: CreateAgentConfig = {}) {
    const rootDir = config.monitoring?.rootDir ?? ".fireworks-plus-plus";
    this.monitoring = {
      rootDir,
      auditPath: config.monitoring?.auditPath ?? path.join(rootDir, "audit.log"),
      checkpointDir: config.monitoring?.checkpointDir ?? path.join(rootDir, "checkpoints"),
      workflowDir: config.monitoring?.workflowDir ?? path.join(rootDir, "workflows")
    };
    this.provider = config.chatModel ? undefined : inferProvider(config);
    this.chatModel = config.chatModel;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.organization = config.organization;
    this.anthropicVersion = config.anthropicVersion;
    this.callbacks = config.callbacks ?? [];
    this.verbose = config.verbose ?? false;
    this.systemPrompt = config.systemPrompt;
    this.toolChoice = config.toolChoice;
    this.memory = config.memory;
    this.defaultThreadId = config.threadId;
    this.maxIterations = config.maxIterations;
    this.earlyStoppingMethod = config.earlyStoppingMethod;
    this.checkpointStore =
      config.checkpointStore ??
      new FileCheckpointStore({ directory: this.monitoring.checkpointDir });
    this.auditLogger =
      config.governance?.auditLogger ??
      new FileAuditLogger({ filePath: this.monitoring.auditPath });

    this.registerTools(config.tools);
    if (config.governance) {
      this.enableGovernance(config.governance);
    }
  }

  private registerTools(
    tools?: BaseTool[] | Record<string, SimpleToolDefinition>
  ): void {
    if (!tools) return;
    if (Array.isArray(tools)) {
      this.tools.push(...tools);
      return;
    }

    for (const [name, definition] of Object.entries(tools)) {
      this.tools.push(normalizeTool(name, definition));
    }
  }

  private buildModel(): BaseChatModel {
    if (this.chatModel) {
      return this.chatModel;
    }

    const callbacks = [...this.callbacks];
    if (this.budgetManager) {
      callbacks.push(
        new GovernanceBudgetHandler({
          budgetManager: this.budgetManager,
          auditLogger: this.auditLogger
        })
      );
    }

    const baseConfig: BaseChatModelConfig = {
      callbacks,
      verbose: this.verbose
    };

    switch (this.provider) {
      case "anthropic":
        return new ChatAnthropic({
          ...baseConfig,
          apiKey: this.apiKey,
          model: this.model,
          baseUrl: this.baseUrl,
          anthropicVersion: this.anthropicVersion
        });
      case "openai":
        return new ChatOpenAI({
          ...baseConfig,
          apiKey: this.apiKey,
          model: this.model,
          baseUrl: this.baseUrl,
          organization: this.organization
        });
      case "gemini":
        return new ChatGemini({
          ...baseConfig,
          apiKey: this.apiKey,
          model: this.model,
          baseUrl: this.baseUrl
        });
      case "perplexity":
        return new ChatPerplexity({
          ...baseConfig,
          apiKey: this.apiKey,
          model: this.model,
          baseUrl: this.baseUrl
        });
      case "ollama":
      default:
        return new ChatOllama({
          ...baseConfig,
          model: this.model,
          baseUrl: this.baseUrl
        });
    }
  }

  private createExecutor(threadId?: string): ToolCallingAgentExecutor {
    const model = this.buildModel();
    const agent = new ToolCallingAgent(model, this.tools, {
      memory: this.memory,
      systemPrompt: this.systemPrompt,
      toolChoice: this.toolChoice
    });

    return new ToolCallingAgentExecutor(agent, {
      threadId: threadId ?? this.defaultThreadId,
      checkpointStore: this.checkpointStore,
      maxIterations: this.maxIterations,
      earlyStoppingMethod: this.earlyStoppingMethod,
      verbose: this.verbose,
      actor: this.actor,
      authorizer: this.authorizer,
      policyEngine: this.policyEngine,
      budgetManager: this.budgetManager,
      auditLogger: this.auditLogger,
      requireApproval: this.requireApproval
    });
  }

  use(name: string, definition: SimpleToolDefinition): this;
  use(tool: BaseTool): this;
  use(
    nameOrTool: string | BaseTool,
    definition?: SimpleToolDefinition
  ): this {
    if (nameOrTool instanceof BaseTool) {
      this.tools.push(nameOrTool);
      return this;
    }

    if (!definition) {
      throw new Error(`Missing tool definition for "${nameOrTool}".`);
    }

    this.tools.push(normalizeTool(nameOrTool, definition));
    return this;
  }

  async useMCP(client: MCPClient): Promise<this> {
    const remoteTools = await client.asTools();
    this.tools.push(...remoteTools);
    return this;
  }

  enableGovernance(config: SimpleGovernanceConfig): this {
    this.actor = config.actor ?? this.actor;
    this.requireApproval = config.requireApproval ?? this.requireApproval;
    this.auditLogger = config.auditLogger ?? this.auditLogger;

    if (config.authorizer) {
      this.authorizer = config.authorizer;
    } else if (config.roles?.length) {
      if (this.authorizer instanceof RBACAuthorizer) {
        for (const role of config.roles) {
          this.authorizer.registerRole(role);
        }
      } else {
        this.authorizer = new RBACAuthorizer({ roles: config.roles });
      }
    }

    if (config.policyEngine) {
      this.policyEngine = config.policyEngine;
    } else if (config.rules?.length) {
      if (this.policyEngine instanceof PolicyEngine) {
        for (const rule of config.rules) {
          this.policyEngine.registerRule(rule);
        }
      } else {
        this.policyEngine = new PolicyEngine({ rules: config.rules });
      }
    }

    if (config.budgets) {
      this.budgetManager = Array.isArray(config.budgets)
        ? new BudgetManager({ limits: config.budgets })
        : config.budgets;
    } else if (config.scopedBudgets?.length) {
      const existing = this.budgetManager instanceof ScopedBudgetManager
        ? this.budgetManager
        : new ScopedBudgetManager();
      for (const limit of config.scopedBudgets) {
        existing.setScopedLimit(limit.scope, limit.name, limit.max);
      }
      this.budgetManager = existing;
    }

    return this;
  }

  async ask(input: string, options: SimpleAskOptions = {}): Promise<SimpleAskResult> {
    const executor = this.createExecutor(options.threadId);
    const result = await executor.call(
      {
        input,
        threadId: options.threadId ?? this.defaultThreadId
      },
      options.callbacks ?? []
    );

    return {
      ...result,
      text: String(result["output"] ?? "")
    };
  }

  async alerts(): Promise<MonitoringAlert[]> {
    const snapshot = await loadMonitoringSnapshot(this.monitoring);
    return new AlertManager().evaluate(snapshot);
  }

  async dashboard(
    options: SimpleDashboardOptions = {}
  ): Promise<MonitoringSnapshot | string> {
    const snapshot = await loadMonitoringSnapshot(this.monitoring);
    if (options.html || options.writeTo) {
      const html = renderMonitoringDashboardHtml(
        snapshot,
        await new AlertManager().evaluate(snapshot)
      );
      if (options.writeTo) {
        const { promises: fs } = await import("fs");
        await fs.writeFile(options.writeTo, html, "utf8");
      }
      return html;
    }
    return snapshot;
  }

  createServer(config: Omit<ManagementServerConfig, "auditPath" | "checkpointDir" | "workflowDir"> = {}): ManagementServer {
    return new ManagementServer({
      auditPath: this.monitoring.auditPath,
      checkpointDir: this.monitoring.checkpointDir,
      workflowDir: this.monitoring.workflowDir,
      ...config
    });
  }

  toExecutor(threadId?: string): ToolCallingAgentExecutor {
    return this.createExecutor(threadId);
  }
}

export function createAgent(config: CreateAgentConfig = {}): SimpleAgent {
  return new SimpleAgent(config);
}
