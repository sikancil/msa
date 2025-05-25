export type PluginConfig = Record<string, any>;

export interface IPluginDependency {
  name: string;          // Name of the dependent plugin
  versionRange: string;  // Semantic version range (e.g., "^1.0.0", "~2.1.x", ">=1.0.0 <2.0.0")
}

export interface IPlugin {
  name: string;
  version: string;
  dependencies: IPluginDependency[]; // New: Supports versioned dependencies
  initialize(config: PluginConfig, dependencies: Map<string, IPlugin>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}
