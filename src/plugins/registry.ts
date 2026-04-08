import type {
  CallbackPluginDefinition,
  CallbackPluginFactoryContext,
  LoaderPluginDefinition,
  LoaderPluginFactoryContext,
  PluginManifest,
  ToolPluginDefinition,
  ToolPluginFactoryContext,
  WorkflowNodePluginDefinition,
  WorkflowPluginFactoryContext
} from "./base";

export class PluginRegistry {
  private toolPlugins = new Map<string, ToolPluginDefinition>();
  private loaderPlugins = new Map<string, LoaderPluginDefinition>();
  private workflowPlugins = new Map<string, WorkflowNodePluginDefinition>();
  private callbackPlugins = new Map<string, CallbackPluginDefinition>();

  registerManifest(manifest: PluginManifest): void {
    for (const tool of manifest.tools ?? []) {
      this.registerTool(tool);
    }
    for (const loader of manifest.loaders ?? []) {
      this.registerLoader(loader);
    }
    for (const workflowNode of manifest.workflowNodes ?? []) {
      this.registerWorkflowNode(workflowNode);
    }
    for (const callback of manifest.callbacks ?? []) {
      this.registerCallback(callback);
    }
  }

  registerTool(plugin: ToolPluginDefinition): void {
    this.toolPlugins.set(plugin.name, plugin);
  }

  registerLoader(plugin: LoaderPluginDefinition): void {
    this.loaderPlugins.set(plugin.name, plugin);
  }

  registerWorkflowNode(plugin: WorkflowNodePluginDefinition): void {
    this.workflowPlugins.set(plugin.name, plugin);
  }

  registerCallback(plugin: CallbackPluginDefinition): void {
    this.callbackPlugins.set(plugin.name, plugin);
  }

  createTool(name: string, context?: ToolPluginFactoryContext) {
    const plugin = this.toolPlugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown tool plugin "${name}".`);
    }
    return plugin.create(context);
  }

  createLoader(name: string, context?: LoaderPluginFactoryContext) {
    const plugin = this.loaderPlugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown loader plugin "${name}".`);
    }
    return plugin.create(context);
  }

  createWorkflowNode(name: string, context?: WorkflowPluginFactoryContext) {
    const plugin = this.workflowPlugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown workflow node plugin "${name}".`);
    }
    return plugin.create(context);
  }

  createCallback(name: string, context?: CallbackPluginFactoryContext) {
    const plugin = this.callbackPlugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown callback plugin "${name}".`);
    }
    return plugin.create(context);
  }

  list(): {
    tools: string[];
    loaders: string[];
    workflowNodes: string[];
    callbacks: string[];
  } {
    return {
      tools: Array.from(this.toolPlugins.keys()).sort(),
      loaders: Array.from(this.loaderPlugins.keys()).sort(),
      workflowNodes: Array.from(this.workflowPlugins.keys()).sort(),
      callbacks: Array.from(this.callbackPlugins.keys()).sort()
    };
  }
}

