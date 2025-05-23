# MSA MCP Plugin (@arifwidianto/msa-plugin-mcp)

This plugin provides client and server implementations for the Model Context Protocol (MCP) within the MSA (Microservice Architecture) framework. It allows MSA services to connect to an MCP server (as a client) or act as an MCP server itself, facilitating standardized message exchange for interacting with models or other context-aware services. MCP communication typically occurs over WebSockets.

## Features

*   **MCPClient**: A WebSocket client to connect to an MCP server.
    *   Manages connection lifecycle (connect, close).
    *   Sends MCP-formatted requests and handles responses.
    *   Supports pending request tracking and timeouts.
    *   Handles server-initiated messages via a configurable handler.
    *   Includes auto-reconnection logic with configurable attempts and intervals.
*   **MCPServer**: An MCP server component.
    *   Integrates with an existing `ITransport` plugin (e.g., `msa-plugin-websocket`) to listen for incoming MCP messages.
    *   Allows registration of action handlers to process MCP requests.
    *   Generates and sends MCP-formatted responses.
*   **MCPPlugin**: An `IPlugin` implementation that wraps both `MCPClient` and `MCPServer`.
    *   Initializes and manages the lifecycle of `MCPClient` (if client mode is configured) and `MCPServer` (if server mode is enabled).
    *   Provides easy access to client and server instances.
*   **MCP Data Structures**: Defines TypeScript interfaces for MCP messages (`MCPRequest`, `MCPResponse`, etc.).

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package. The necessary dependencies (`ws`, `@arifwidianto/msa-core`) should be automatically managed.

```bash
# If managing dependencies manually:
npm install ws @arifwidianto/msa-plugin-mcp @arifwidianto/msa-core
# or
yarn add ws @arifwidianto/msa-plugin-mcp @arifwidianto/msa-core
```

## Configuration

The `MCPPlugin` is configured during the service initialization phase. It supports separate configurations for client and server modes.

### `MCPPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

// Configuration for MCP Server mode
export interface MCPServerConfig {
  enabled: boolean; // To enable server mode
  // port?: number; // Not directly used if relying on a transport plugin like WebSocketPlugin
  // host?: string; // Not directly used if relying on a transport plugin
  // path?: string; // Path configuration should be handled by the underlying WebSocket transport plugin
  transportPluginName?: string; // Required: Name of the transport plugin to use (e.g., 'msa-plugin-websocket')
}

// Main configuration for MCPPlugin
export interface MCPPluginConfig extends PluginConfig {
  client?: { // Client mode configuration
    serverUrl: string; // Required: The WebSocket URL of the MCP server to connect to.
    autoReconnectClient?: boolean;      // Optional: Defaults to true in MCPClient.
    maxReconnectAttemptsClient?: number; // Optional: Defaults to 5 in MCPClient.
    reconnectIntervalClient?: number;   // Optional: Defaults to 5000ms in MCPClient.
  };
  server?: MCPServerConfig; // Server mode configuration
}
```

### Environment Variables

It's recommended to provide sensitive or environment-specific configurations (like `serverUrl` for the client) via environment variables, using `@arifwidianto/msa-core`'s `Config` class.

Example: Set `MCP_CLIENT_SERVER_URL="ws://some-mcp-server:8080/mcp"` for client mode.

### Example Service Setup

```typescript
// In your main service setup
import { Service, Config, Logger, ITransport } from '@arifwidianto/msa-core';
import { MCPPlugin, MCPPluginConfig, MCPRequestHandler, MCPRequest, MCPContext, MCPResponse } from '@arifwidianto/msa-plugin-mcp';
import { WebSocketPlugin, WebSocketPluginConfig } from '@arifwidianto/msa-plugin-websocket'; // Assuming WebSocket transport

const service = new Service();

// Instantiate plugins
const mcpPlugin = new MCPPlugin();
const wsPlugin = new WebSocketPlugin(); // Transport plugin for the MCP server

// Register plugins with the service
service.registerPlugin(wsPlugin); // Register transport first
service.registerPlugin(mcpPlugin);

// Configuration
const pluginConfigs = {
  [wsPlugin.name]: { // Configuration for WebSocketPlugin
    port: 8080,
    host: '0.0.0.0',
    // path: '/mcp' // Optional: if you want MCP server on a specific path
  } as WebSocketPluginConfig,

  [mcpPlugin.name]: {
    client: { // Example client configuration (optional)
      serverUrl: Config.get('MCP_ANOTHER_SERVER_URL'), // If this service also acts as a client to another MCP server
    },
    server: { // Example server configuration
      enabled: true,
      transportPluginName: wsPlugin.name, // Crucial: Link to the WebSocket transport plugin
    }
  } as MCPPluginConfig
};

// Initialize and start the service
async function main() {
  // It's assumed MCPPlugin.initialize is modified to accept the Service instance or a core access object
  // to retrieve other plugins and the logger. For this example, we'll assume a hypothetical
  // `service.initializePlugins(pluginConfigs)` that handles inter-plugin dependencies.
  // The MCPPlugin's initialize method would then look up the transport plugin.

  // For MCPServer to work, the MCPPlugin needs access to the transport instance.
  // This might be handled by the service's initialization logic, e.g.:
  // service.initializeService(pluginConfigs, { 
  //   getService: () => service, 
  //   getPlugin: (name) => service.getPlugin(name), // Simplified
  //   getLogger: (context) => Logger // Simplified 
  // });
  // Or, more simply, if MCPPlugin's initialize is called manually with the transport:
  
  if (pluginConfigs[mcpPlugin.name].server?.enabled) {
      const transport = service.getPlugin<ITransport>(pluginConfigs[mcpPlugin.name].server!.transportPluginName!);
      if (transport) {
          await mcpPlugin.initialize(pluginConfigs[mcpPlugin.name], transport);
      } else {
          Logger.error("Failed to get transport for MCP Server.");
          return; // Exit or handle error
      }
  } else if (pluginConfigs[mcpPlugin.name].client?.serverUrl) {
      await mcpPlugin.initialize(pluginConfigs[mcpPlugin.name]);
  }


  await service.startService(); // Starts WebSocket server and attempts MCPClient connection if configured

  // --- MCP Server: Register Action Handlers ---
  if (mcpPlugin.getServer()) { // Check if server was initialized
    const exampleActionHandler: MCPRequestHandler = async (request: MCPRequest, context: MCPContext) => {
      Logger.info({ msg: 'MCP Server: Handling exampleAction', request });
      // Process the request...
      return {
        payload: { result: `Action '${request.action}' processed successfully for data: ${JSON.stringify(request.payload)}` },
        // status: 'success', // Optional, defaults to success
        // context: { ...context, newInfo: 'added_by_handler' } // Optional: update context
      };
    };
    mcpPlugin.registerServerAction('exampleAction', exampleActionHandler);
    Logger.info("MCP Server: 'exampleAction' handler registered.");
  }

  // --- MCP Client: Send Request (if client is configured and connected) ---
  if (mcpPlugin.getClient() && pluginConfigs[mcpPlugin.name].client?.serverUrl) {
    try {
      const client = mcpPlugin.getClient();
      // Ensure client is connected (startService should attempt this)
      // For a robust check: if (client.getReadyState() === WebSocket.OPEN) { ... }
      Logger.info("MCP Client: Attempting to send 'exampleAction' to remote server...");
      const response = await client.sendRequest('exampleAction', { data: "Hello from client!" });
      Logger.info({ msg: "MCP Client: Received response from remote server", response });
    } catch (error) {
      Logger.error({ msg: "MCP Client: Error sending request or processing response", error });
    }
  }
}

main().catch(error => Logger.error({ msg: "Service failed to start or run", error }));
```

## Client Mode Usage

If `config.client.serverUrl` is provided, the plugin initializes an `MCPClient`.

### Getting the Client

```typescript
// Assuming mcpPlugin is an initialized instance of MCPPlugin
const client: MCPClient = mcpPlugin.getClient();
```

### Sending a Request

The `sendRequest` method sends an MCP request to the server and returns a promise that resolves with the `MCPResponse`.

```typescript
import { MCPRequest, MCPResponse, MCPContext } from '@arifwidianto/msa-plugin-mcp'; // Import types
import { Logger } from '@arifwidianto/msa-core';

async function performClientAction(action: string, payload: any) {
  try {
    const client = mcpPlugin.getClient(); // Get client instance
    const context: MCPContext = { sessionId: "clientSession789" };
    Logger.info(`MCP Client: Sending MCP request for action: ${action}`);
    
    const response: MCPResponse = await client.sendRequest(action, payload, context);

    if (response.status === 'success') {
      Logger.info(`MCP Client: Action "${action}" successful. Payload: ${JSON.stringify(response.payload)}`);
      return response.payload;
    } else {
      // ... error handling ...
    }
  } catch (error) {
    // ... error handling ...
  }
}
```

### Handling Server-Initiated Messages (Client)

The client can receive messages not directly in response to its requests.
```typescript
client.setOnMessageHandler((message: MCPMessage) => {
  Logger.info(`MCP Client: Received server-initiated message: Type: ${message.type}, ID: ${message.messageId}`);
  // Process message
});
```

## Server Mode Usage

If `config.server.enabled` is true and `config.server.transportPluginName` is provided, the plugin initializes an `MCPServer`.

### Registering Action Handlers

The core of the server functionality is handling actions.
```typescript
import { MCPRequestHandler, MCPRequest, MCPContext } from '@arifwidianto/msa-plugin-mcp';
import { Logger } from '@arifwidianto/msa-core';

const myActionHandler: MCPRequestHandler = async (request: MCPRequest, context: MCPContext) => {
  Logger.info(`MCP Server: Handling action '${request.action}' with payload:`, request.payload);
  // Business logic here...
  if (request.payload.value > 100) {
    return {
      status: 'error',
      error: { code: 'VALUE_TOO_HIGH', message: 'Value cannot exceed 100' }
    };
  }
  return {
    payload: { processedValue: request.payload.value * 2, message: "Successfully processed by server." },
    context: { ...context, processedTimestamp: new Date().toISOString() } // Optionally update context
  };
};

// Assuming mcpPlugin is initialized and server mode is enabled
if (mcpPlugin.getServer()) {
    mcpPlugin.registerServerAction('processData', myActionHandler);
    Logger.info("MCP Server: 'processData' handler registered.");
}
```
The `MCPServer` receives raw messages from the specified transport plugin (e.g., `msa-plugin-websocket`), parses them as MCP messages, invokes the appropriate handler, and sends the response back via the transport.

### Transport Integration

The `MCPServer` relies on an `ITransport` plugin (like `msa-plugin-websocket`) for actual network communication. The `MCPPlugin` must be configured with the name of this transport plugin, and the core `Service` is responsible for providing the instance of this transport to the `MCPPlugin` during initialization. The lifecycle (start, stop) of the transport is managed by its own plugin and the core `Service`.

This plugin provides a comprehensive solution for both client-side and server-side MCP communication within an MSA application. The specific `action` strings and `payload` structures will depend on the MCP server's implementation and the defined protocol.
