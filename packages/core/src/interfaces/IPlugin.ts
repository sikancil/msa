export type PluginConfig = Record<string, any>;

export interface IPlugin {
  name: string;
  version: string;
  dependencies: string[]; // Names of other plugins this plugin depends on
  initialize(config: PluginConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}
