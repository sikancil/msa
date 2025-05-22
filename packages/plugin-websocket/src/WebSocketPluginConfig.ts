import { PluginConfig } from '@arifwidianto/msa-core';

export interface WebSocketPluginConfig extends PluginConfig {
  port: number;
  path?: string; // Optional: WebSocket path, e.g., /ws, defaults to root '/'
  host?: string; // Optional: specify host, e.g., '0.0.0.0' to listen on all interfaces
}
