import type { CallbackHandler } from "../schema/types";
import type { BaseDocumentLoader } from "../document_loaders/base";
import type { BaseTool } from "../tools/base";
import type { WorkflowNodeHandler } from "../workflows/graph";

export interface ToolPluginFactoryContext {
  config?: Record<string, unknown>;
}

export interface LoaderPluginFactoryContext {
  config?: Record<string, unknown>;
}

export interface WorkflowPluginFactoryContext {
  config?: Record<string, unknown>;
}

export interface CallbackPluginFactoryContext {
  config?: Record<string, unknown>;
}

export interface ToolPluginDefinition {
  kind: "tool";
  name: string;
  description?: string;
  create(context?: ToolPluginFactoryContext): BaseTool;
}

export interface LoaderPluginDefinition {
  kind: "loader";
  name: string;
  description?: string;
  create(context?: LoaderPluginFactoryContext): BaseDocumentLoader;
}

export interface WorkflowNodePluginDefinition {
  kind: "workflow_node";
  name: string;
  description?: string;
  create(context?: WorkflowPluginFactoryContext): WorkflowNodeHandler;
}

export interface CallbackPluginDefinition {
  kind: "callback";
  name: string;
  description?: string;
  create(context?: CallbackPluginFactoryContext): CallbackHandler;
}

export type PluginDefinition =
  | ToolPluginDefinition
  | LoaderPluginDefinition
  | WorkflowNodePluginDefinition
  | CallbackPluginDefinition;

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  tools?: ToolPluginDefinition[];
  loaders?: LoaderPluginDefinition[];
  workflowNodes?: WorkflowNodePluginDefinition[];
  callbacks?: CallbackPluginDefinition[];
}

