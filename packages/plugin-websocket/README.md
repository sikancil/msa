# MSA WebSocket Plugin (@arifwidianto/msa-plugin-websocket)

This plugin provides a WebSocket server transport for the MSA (Microservice Architecture) framework. It uses the `ws` library to create and manage a WebSocket server, enabling real-time, bidirectional communication between clients and the service.

## Features

*   Starts and stops a standalone WebSocket server.
*   Configurable port, host, and WebSocket path (e.g., `/ws`).
*   Handles client connections, disconnections, and incoming messages.
*   Broadcasts messages to all connected clients.
*   Implements `IPlugin` and `ITransport` from `@arifwidianto/msa-core`.

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package. The necessary dependencies (`ws`, `@types/ws`) should be automatically managed if using Lerna or npm/yarn workspaces.

## Configuration

The `WebSocketPlugin` can be configured during the service initialization phase. The configuration is passed to its `initialize` method.

### `WebSocketPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

export interface WebSocketPluginConfig extends PluginConfig {
  port: number;      // Required: The port number for the WebSocket server to listen on.
  host?: string;    // Optional: The host address (e.g., '0.0.0.0' or 'localhost'). Defaults to 'localhost'.
  path?: string;    // Optional: The WebSocket path (e.g., '/ws', '/api/socket'). Defaults to the root path '/'.
}
```

### Example Configuration

```typescript
// In your main service setup
import { Service } from '@arifwidianto/msa-core';
import { WebSocketPlugin, WebSocketPluginConfig } from '@arifwidianto/msa-plugin-websocket';

const service = new Service();
const wsPlugin = new WebSocketPlugin();

const pluginConfigs = {
  'msa-plugin-websocket': {
    port: 8081, // Separate port from HTTP if both are used
    host: '0.0.0.0',
    path: '/realtime'
  } as WebSocketPluginConfig
};

service.registerPlugin(wsPlugin);
await service.initializeService(pluginConfigs);
await service.startService();
```

## Basic Usage

### Handling Incoming Messages

To process messages received from WebSocket clients, you register a message handler using the `onMessage` method (part of the `ITransport` interface).

```typescript
import { Message, Logger } from '@arifwidianto/msa-core';

// Assuming wsPlugin is an instance of WebSocketPlugin that has been initialized and started
wsPlugin.onMessage((message: Message) => {
  Logger.info(`Received WebSocket message: ${message}`);
  // Process the message (e.g., parse JSON, trigger actions)
  // The 'message' type here depends on how ITransport.Message is defined in core.
  // For 'ws', it's typically a string, Buffer, or ArrayBuffer.
  // The plugin currently converts RawData to string.
});
```

### Sending Messages (Broadcasting)

The `send` method (part of the `ITransport` interface) will broadcast the provided message to all currently connected WebSocket clients.

```typescript
// Assuming wsPlugin is an instance of WebSocketPlugin
try {
  await wsPlugin.send('Hello to all connected clients!');
  // For structured data, serialize to JSON string before sending:
  // await wsPlugin.send(JSON.stringify({ type: 'update', data: { value: 42 } }));
} catch (error) {
  Logger.error(`Failed to send WebSocket message: ${error}`);
}
```

### Accessing the `ws.WebSocketServer` Instance

For more advanced configurations or direct access to the `ws.WebSocketServer` instance, you can use the `getWebSocketServer()` method:

```typescript
const wssInstance = wsPlugin.getWebSocketServer();
if (wssInstance) {
  // Access underlying ws.WebSocketServer properties and methods if needed
  // For example, wssInstance.clients provides the set of connected clients
}
```

## ITransport Implementation Notes

*   `listen(portOrPath)`: Configures the port the server will use when `start()` is called. The server runs on its own dedicated port.
*   `send(message)`: Broadcasts the message to all connected clients.
*   `onMessage(handler)`: Registers a handler for incoming messages from any client.
*   `close()`: Equivalent to `stop()`, it closes the server and disconnects all clients.

This plugin provides the foundational server-side WebSocket capabilities. Client-specific message routing or session management would typically be built on top of this transport layer.
