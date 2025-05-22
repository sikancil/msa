import { PluginConfig } from '@arifwidianto/msa-core';

export interface HttpPluginConfig extends PluginConfig {
  port: number;
  host?: string; // Optional: specify host, e.g., '0.0.0.0' to listen on all interfaces
}
