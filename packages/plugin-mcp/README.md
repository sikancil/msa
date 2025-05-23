# MSA Model Context Protocol Plugin (@arifwidianto/msa-plugin-mcp)

This plugin implements the Model Context Protocol (MCP) for the MSA framework, enabling AI model communication and context management between clients and servers. The MCP plugin allows services to function as either MCP clients or servers, facilitating standardized communication between systems that utilize AI models.

## Features

* Dual-mode operation: Client or Server implementation
* WebSocket-based communication with reliable connection management
* Standardized message format for model inputs and outputs
* Context tracking and management across interactions
* Timeout and error handling for robust operation
* Seamless integration with MSA plugin architecture
* Compatible with LLM services via the Langchain plugin
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

```bash
npm install @arifwidianto/msa-plugin-mcp @arifwidianto/msa-core
```

## Quick Start

### MCP Server

```typescript
import { Service } from '@arifwidianto/msa-core';
import { MCPPlugin } from '@arifwidianto/msa-plugin-mcp';
import { LangchainPlugin } from '@arifwidianto/msa-plugin-langchain';

async function main() {
  const service = new Service();
  
  // Register needed plugins
  const mcpPlugin = new MCPPlugin();
  const langchainPlugin = new LangchainPlugin();
  
  service.registerPlugin(mcpPlugin);
  service.registerPlugin(langchainPlugin);
  
  // Initialize plugins with configuration
  await service.initializeService({
    'msa-plugin-mcp': {
      mode: 'server',
      port: 3030
    },
    'msa-plugin-langchain': {
      provider: 'openai',
      auth: {
        apiKey: 'your-api-key'
      }
    }
  });
  
  // Connect MCP to the language model
  mcpPlugin.setModelProvider(langchainPlugin);
  
  // Start the service
  await service.startService();
  console.log('MCP Server started on port 3030');
}

main().catch(console.error);
```

### MCP Client

```typescript
import { Service } from '@arifwidianto/msa-core';
import { MCPPlugin } from '@arifwidianto/msa-plugin-mcp';

async function main() {
  const service = new Service();
  
  const mcpPlugin = new MCPPlugin();
  service.registerPlugin(mcpPlugin);
  
  await service.initializeService({
    'msa-plugin-mcp': {
      mode: 'client',
      serverUrl: 'ws://localhost:3030'
    }
  });
  
  await service.startService();
  
  // Get the MCP client
  const client = mcpPlugin.getClient();
  
  // Send a request to the MCP server
  const response = await client.sendRequest({
    type: 'generate',
    inputs: {
      prompt: 'Explain quantum computing in simple terms'
    }
  });
  
  console.log('Response:', response);
}

main().catch(console.error);
```

## Configuration

The MCP Plugin can be configured with the following options:

```typescript
interface MCPPluginConfig {
  mode: 'client' | 'server';
  
  // Server-specific options
  port?: number;
  host?: string;
  
  // Client-specific options
  serverUrl?: string;
  
  // Common options
  requestTimeoutMs?: number; // Default: 30000 (30 seconds)
  reconnectIntervalMs?: number; // Default: 5000 (5 seconds)
  maxReconnectAttempts?: number; // Default: 10
}
```

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

## API Reference

### MCPPlugin

The main plugin class that implements the IPlugin interface:

```typescript
class MCPPlugin implements IPlugin {
  // Get the underlying client or server instance
  getClient(): MCPClient | null;
  getServer(): MCPServer | null;

  // For server mode: set the model provider
  setModelProvider(provider: IModelProvider): void;

  // For client mode: convenience methods
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  onServerMessage(handler: (message: any) => void): void;
}
```

### MCPClient

Client implementation for connecting to MCP servers:

```typescript
class MCPClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  sendRequest(request: MCPRequest): Promise<MCPResponse>;
  onServerMessage(handler: (message: any) => void): void;
}
```

### MCPServer

Server implementation for handling MCP requests:

```typescript
class MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  
  setModelProvider(provider: IModelProvider): void;
  broadcast(message: any): void;
}
```

## MCP Message Types

The plugin uses standardized message formats for MCP communication:

```typescript
interface MCPRequest {
  type: string;            // e.g., 'generate', 'embeddings', etc.
  messageId?: string;      // Auto-generated if not provided
  contextId?: string;      // For tracking conversation context
  inputs: {                // Input data for the model
    [key: string]: any;    // Could include prompt, messages, etc.
  };
  options?: {              // Optional parameters
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
}

interface MCPResponse {
  messageId: string;       // Corresponds to request messageId
  contextId?: string;      // Same as request if provided
  outputs: {               // Output data from the model
    [key: string]: any;    // Could include generated text, etc.
  };
  status: 'success' | 'error';
  error?: {                // Present only if status is 'error'
    code: string;
    message: string;
  };
}
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm run test

# Development mode with watch
npm run dev
```

## Integration with Other Plugins

The MCP plugin works especially well with:

- `@arifwidianto/msa-plugin-langchain` - For model providers
- `@arifwidianto/msa-plugin-websocket` - For additional WebSocket capabilities
- `@arifwidianto/msa-plugin-http` - For exposing REST APIs alongside MCP
