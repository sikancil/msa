import { PluginConfig } from '@arifwidianto/msa-core';

export interface MCPServerConfig {
  enabled: boolean; // To enable server mode
  port?: number; // If using a dedicated port for MCP server (less relevant if using transport plugin)
  host?: string; // If using a dedicated port
  path?: string; // If WebSocket server is shared, e.g., /mcp (more relevant for WebSocket transport)
  transportPluginName?: string; // Name of the transport plugin to use (e.g., 'msa-plugin-websocket')
}

export interface MCPPluginConfig extends PluginConfig {
  client?: { // Existing client config
    serverUrl: string;
    autoReconnectClient?: boolean; // Optional: defaults to true in MCPClient
    maxReconnectAttemptsClient?: number; // Optional: defaults to 5 in MCPClient
    reconnectIntervalClient?: number;   // Optional: defaults to 5000ms in MCPClient
  };
  server?: MCPServerConfig;
}
