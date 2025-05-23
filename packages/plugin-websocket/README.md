# MSA WebSocket Plugin (@arifwidianto/msa-plugin-websocket)

This plugin provides real-time, bidirectional communication capabilities for the MSA framework using WebSockets. Built on the `ws` library, it enables services to establish persistent connections with clients for efficient real-time data exchange.

## Features

* Standalone WebSocket server with connection management
* Real-time bidirectional communication
* Configurable port, host, and path settings
* Automatic client tracking and management
* Broadcasting capability to all connected clients
* Connection event handling (connect, disconnect, error)
* Secure WebSocket support (WSS)
* Full implementation of both `IPlugin` and `ITransport` interfaces

## Installation

```bash
npm install @arifwidianto/msa-plugin-websocket @arifwidianto/msa-core
```

## Quick Start

```typescript
import { Service, Logger } from '@arifwidianto/msa-core';
import { WebSocketPlugin } from '@arifwidianto/msa-plugin-websocket';

async function main() {
  const service = new Service();
  const wsPlugin = new WebSocketPlugin();
  
  service.registerPlugin(wsPlugin);
  
  await service.initializeService({
    'msa-plugin-websocket': {
      port: 8080,
      path: '/ws'
    }
  });
  
  // Set up message handler before starting
  wsPlugin.onMessage((message) => {
    Logger.info(`Received WebSocket message: ${message}`);
    
    // Echo the message back with a timestamp
    const response = {
      type: 'echo',
      originalMessage: message,
      timestamp: new Date().toISOString()
    };
    
    // Broadcast to all clients
    wsPlugin.send(JSON.stringify(response));
  });
  
  await service.startService();
  Logger.info('WebSocket server started on ws://localhost:8080/ws');
}

main().catch(console.error);
```

## Configuration

The WebSocket Plugin can be configured with the following options:

```typescript
interface WebSocketPluginConfig {
  port: number;      // Required: The port number for the WebSocket server
  host?: string;     // Optional: The host address (e.g., '0.0.0.0' or 'localhost')
  path?: string;     // Optional: The WebSocket path (e.g., '/ws', '/socket')
}
```

### Example Configuration

```typescript
{
  'msa-plugin-websocket': {
    port: 8080,           // Listen on port 8080
    host: '0.0.0.0',      // Listen on all network interfaces
    path: '/realtime'     // WebSocket path: ws://hostname:8080/realtime
  }
}
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

## API Reference

### send(message)

Send a message to all connected WebSocket clients:

```typescript
// Broadcast a simple string
wsPlugin.send('Hello, all connected clients!');

// Broadcast a JSON object (automatically stringified)
wsPlugin.send(JSON.stringify({
  type: 'update',
  data: {
    value: 42,
    message: 'New data available'
  }
}));
```

### onMessage(handler)

Register a handler for incoming WebSocket messages:

```typescript
wsPlugin.onMessage((message) => {
  try {
    // Parse message if it's JSON
    const data = JSON.parse(message.toString());
    
    // Process the message
    if (data.type === 'request') {
      // Handle request
    }
  } catch (error) {
    // Handle parsing error
    Logger.error(`Error processing message: ${error.message}`);
  }
});
```

### getWebSocketServer()

Access the underlying `ws.WebSocketServer` instance for advanced configuration:

```typescript
const wss = wsPlugin.getWebSocketServer();
if (wss) {
  // Access the set of connected clients
  const clientCount = wss.clients.size;
  Logger.info(`Current connected clients: ${clientCount}`);
  
  // Set up custom event handlers
  wss.on('headers', (headers, request) => {
    // Add custom headers before upgrading
    headers.push('X-Custom-Header: Value');
  });
}
```

## Browser Client Example

Here's an example of how to connect to the WebSocket server from a browser client:

```javascript
// Connect to the WebSocket server
const socket = new WebSocket('ws://localhost:8080/ws');

// Set up event handlers
socket.addEventListener('open', (event) => {
  console.log('Connected to WebSocket server');
  
  // Send a message to the server
  socket.send(JSON.stringify({
    type: 'greeting',
    message: 'Hello from browser client!'
  }));
});

socket.addEventListener('message', (event) => {
  try {
    const data = JSON.parse(event.data);
    console.log('Received message:', data);
    
    // Handle different message types
    if (data.type === 'echo') {
      console.log('Server echoed:', data.originalMessage);
    }
  } catch (error) {
    console.error('Failed to parse message:', error);
    console.log('Raw message:', event.data);
  }
});

socket.addEventListener('close', (event) => {
  console.log('Connection closed:', event.code, event.reason);
});

socket.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});
```

## Node.js Client Example

For Node.js clients, you can use the same `ws` library:

```typescript
import WebSocket from 'ws';

const client = new WebSocket('ws://localhost:8080/ws');

client.on('open', () => {
  console.log('Connected to server');
  client.send(JSON.stringify({ type: 'hello', message: 'Hello from Node.js client!' }));
});

client.on('message', (data) => {
  console.log('Received:', data.toString());
});

client.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
});
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
