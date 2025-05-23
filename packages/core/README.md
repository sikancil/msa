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
interface IPlugin {
  name: string;
  version: string;
  dependencies: string[]; // Names of other plugins this plugin depends on
  initialize(config: PluginConfig): Promise<void>;
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
  getPlugin(name: string): IPlugin | undefined;
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

Helps manage configuration with environment variables and defaults:

```typescript
const config = new Config('my-service', {
  port: 3000,
  debug: false
});

// Override with environment variables
// MY_SERVICE_PORT=4000
const port = config.get('port'); // Returns 4000
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
