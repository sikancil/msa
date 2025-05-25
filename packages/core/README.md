# MSA Core (@arifwidianto/msa-core)

This is the core foundation package for the MSA (Microservice Architecture) framework. It provides essential interfaces, base classes, and utility functions that all other MSA packages build upon. The core package enables the plugin architecture that makes MSA flexible and adaptable to various service types.

## Features

* Plugin architecture with dependency management
* Service lifecycle management
* Standardized interfaces for plugins and transports
* Logging utilities
* Configuration management
* Type definitions for common messaging patterns

## Installation

```bash
npm install @arifwidianto/msa-core
```

## Quick Start

```typescript
import { Service, IPlugin } from '@arifwidianto/msa-core';

// Create a new service
const service = new Service();

// Register plugins
service.registerPlugin(myPlugin);

// Initialize and start the service
await service.initializeService({
  'plugin-name': {
    // Plugin-specific configuration
  }
});

await service.startService();
```

## Core Interfaces

### IPlugin

The foundational interface that all plugins must implement:

```typescript
interface IPluginDependency {
  name: string;          // Name of the dependent plugin
  versionRange: string;  // Semantic version range (e.g., "^1.0.0")
}

interface IPlugin {
  name: string;
  version: string;
  dependencies: IPluginDependency[]; // Describes versioned dependencies on other plugins
  initialize(config: PluginConfig, dependencies: Map<string, IPlugin>): Promise<void>; // Receives config and a map of its resolved dependency instances
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}
```

### ITransport

Interface for plugins that handle message passing:

```typescript
interface ITransport {
  listen(port: number | string): Promise<void>; 
  send(message: Message): Promise<void>;
  onMessage(handler: MessageHandler): void;
  close(): Promise<void>;
}
```

### IAgent

Interface for implementing intelligent agent capabilities:

```typescript
interface IAgent {
  name: string;
  capabilities: AgentCapability[];
  handleRequest(request: AgentRequest): Promise<AgentResponse>;
  learn(data: any): Promise<void>;
}
```

## Service Class

The `Service` class is the main entry point for creating MSA applications:

```typescript
class Service {
  registerPlugin(plugin: IPlugin): void;
  unregisterPlugin(pluginName: string): Promise<void>;
  getPlugin(name: string): IPlugin | undefined;
  getEventEmitter(): EventEmitter; // From Node.js 'events' module
  async initializeService(configs: Record<string, PluginConfig>): Promise<void>;
  async startService(): Promise<void>;
  async stopService(): Promise<void>;
  async cleanupService(): Promise<void>;
}
```

## Utilities

### Logger

Provides standardized logging across all MSA components:

```typescript
Logger.info('Informational message');
Logger.debug('Debug message');
Logger.warn('Warning message');
Logger.error('Error message');
```

### Config

A static utility class to retrieve configuration values, primarily from environment variables, with support for defaults and type conversion.

```typescript
// Retrieve a configuration value for 'PORT', defaulting to 3000 if not set by env var APP_PORT
const port = Config.get('APP_PORT', 3000); 

// Retrieve a log level, defaulting to 'info'
const logLevel = Config.get('LOG_LEVEL', 'info');

// Example: process.env.APP_PORT = "8080" would make port be 8080.
// Example: process.env.LOG_LEVEL = "debug" would make logLevel be "debug".
```
The `Config.get` method automatically handles conversion of environment variables to `boolean` (e.g., "true", "false") and `number` (e.g., "123", "123.45") types based on the type of the default value provided. If no default is provided, it returns a string or `undefined`.

## Monitoring Hooks

The `Service` instance provides access to an `EventEmitter` (from Node.js 'events' module) that emits events at various stages of the service and plugin lifecycles. This allows for monitoring, custom logging, or extending behavior based on these events.

```typescript
import { Service } from '@arifwidianto/msa-core';
const service = new Service();
const emitter = service.getEventEmitter();

emitter.on('service:initialized', () => {
  console.log('Service has finished initializing!');
});

emitter.on('plugin:registered', (eventPayload) => {
  console.log(`Plugin registered: ${eventPayload.pluginName} version ${eventPayload.version}`);
});

emitter.on('plugin:initializationFailed', (eventPayload) => {
  console.error(`Failed to initialize plugin ${eventPayload.pluginName}:`, eventPayload.error);
});

// Refer to Service.ts or future documentation for a full list of events.
// Key events include:
// - Service lifecycle: service:initializing, service:initialized, service:starting, service:started, service:stopping, service:stopped, service:cleaningUp, service:cleanedUp, service:signalReceived
// - Plugin lifecycle: plugin:registering, plugin:registered, plugin:unregistering, plugin:unregistered, 
//   plugin:initializing, plugin:initialized, plugin:starting, plugin:started, plugin:stopping, plugin:stopped, plugin:cleaningUp, plugin:cleanedUp
// - Plugin errors: plugin:registrationFailed, plugin:unregistrationFailed, plugin:initializationFailed, plugin:startFailed, plugin:stopFailed, plugin:cleanupFailed
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

## API Documentation

For complete API documentation, see the TypeScript definition files or generated documentation.
