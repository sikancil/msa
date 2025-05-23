# MSA - Generic and Flexible Microservice Agent Framework

A versatile TypeScript NPM monorepo framework designed as a foundational agent for building diverse service architectures with integrated LLM capabilities. MSA provides developers with a plugin-based approach to construct flexible microservices that adapt to real-world application requirements, powered by AI-driven interactions and protocol support.

## Overview

MSA serves as a TypeScript-based core foundation that becomes whatever service type you need through its plugin architecture. By injecting one or more specialized plugin packages into the lightweight core, developers can rapidly build and deploy various service patterns without being locked into a specific transport layer or communication protocol.

**Enhanced with LLM Integration** - Built-in Langchain integration enables AI-powered services, intelligent agents, and protocol-aware communication systems for modern AI-driven applications.

## Packages

This monorepo contains the following packages:

| Package | Description |
|---------|-------------|
| [@arifwidianto/msa-core](packages/core) | Core foundation with essential interfaces and base functionality |
| [@arifwidianto/msa-plugin-http](packages/plugin-http) | HTTP server plugin using Express.js |
| [@arifwidianto/msa-plugin-websocket](packages/plugin-websocket) | WebSocket server plugin using ws |
| [@arifwidianto/msa-plugin-stdio](packages/plugin-stdio) | Standard I/O plugin with CLI capabilities |
| [@arifwidianto/msa-plugin-langchain](packages/plugin-langchain) | LLM integration using Langchain |
| [@arifwidianto/msa-plugin-mcp](packages/plugin-mcp) | Model Context Protocol implementation |
| [@arifwidianto/msa-plugin-messagebroker](packages/plugin-messagebroker) | Message broker integration with RabbitMQ and Redis |

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/msa.git
cd msa

# Install dependencies
npm install

# Build all packages
npm run build
```

## Getting Started

Here's a simple example of creating an HTTP service with LLM capabilities:

```typescript
import { Service } from '@arifwidianto/msa-core';
import { HttpPlugin } from '@arifwidianto/msa-plugin-http';
import { LangchainPlugin } from '@arifwidianto/msa-plugin-langchain';

async function main() {
  // Create a new service
  const service = new Service();
  
  // Register plugins
  const httpPlugin = new HttpPlugin();
  const langchainPlugin = new LangchainPlugin();
  
  service.registerPlugin(httpPlugin);
  service.registerPlugin(langchainPlugin);
  
  // Initialize service with configurations
  await service.initializeService({
    'msa-plugin-http': {
      port: 3000
    },
    'msa-plugin-langchain': {
      provider: 'openai',
      auth: {
        apiKey: 'your-api-key'
      }
    }
  });
  
  // Register an HTTP route that uses the LangchainPlugin
  httpPlugin.registerRoute('post', '/generate', async (req, res) => {
    try {
      const result = await langchainPlugin.invokeChain(
        'Generate a response to: {prompt}',
        { prompt: req.body.prompt }
      );
      res.json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Start the service
  await service.startService();
  
  console.log('Service started on port 3000');
}

main().catch(console.error);
```

## Supported Service Types

### StdIO (CLI) Services
Transform your core logic into command-line interfaces and terminal-based applications with full stdin/stdout handling capabilities.

### Microservices Architecture Components  
Build scalable microservice ecosystems with flexible transport options:
- **Message Broker Integration** - Connect via RabbitMQ, Apache Kafka, Redis Pub/Sub, or other messaging systems
- **HTTP/WebSocket Services** - RESTful APIs and real-time bidirectional communication

### RPC/JSON-RPC 2.0 Web Services
Implement standards-compliant remote procedure call services with multiple transport mechanisms:
- **HTTP API** - Traditional request/response with optional Server-Sent Events (SSE) for streaming
- **WebSocket** - Full-duplex communication for real-time RPC interactions

### AI-Powered Protocol Services
Leverage integrated LLM capabilities with Langchain support for intelligent service interactions:
- **Model Context Protocol (MCP)** - Build both MCP Clients and Servers for AI model communication and context management
- **Google A2A Protocol (Agent-to-Agent)** - Create intelligent agents capable of autonomous inter-agent communication and coordination

## Architecture Philosophy

**Core + Plugins = Your AI-Enhanced Service**

The MSA framework follows a minimalist core principle where the TypeScript-based package provides essential service lifecycle management and LLM integration capabilities, while specialized plugin packages handle transport layers, protocols, and service-specific functionality. This separation allows for:

- **Mix and Match** - Combine multiple plugins for hybrid service capabilities with AI enhancements
- **Transport Agnostic** - Switch between HTTP, WebSocket, message brokers, MCP, A2A, or CLI without core logic changes  
- **AI-First Architecture** - Langchain integration at the core enables intelligent decision-making across all service types
- **Protocol Aware** - Native support for modern AI protocols (MCP, A2A) alongside traditional communication patterns
- **Lightweight Deployment** - Include only the capabilities your service actually needs
- **Easy Testing** - Mock transport layers and LLM interactions independently from business logic

## Use Cases

- **AI-Powered API Gateways** - HTTP + WebSocket + MCP plugins for intelligent request routing
- **Intelligent Background Workers** - Message Broker + A2A plugins for autonomous task processing
- **Real-time AI Applications** - WebSocket + Langchain plugins for live AI-powered interactions
- **AI DevOps Tools** - CLI + MCP plugins for intelligent automation utilities
- **Multi-Agent Systems** - A2A + Message Broker plugins for distributed AI coordination
- **LLM Context Servers** - MCP Server plugins for managing AI model contexts and capabilities
- **Agent Orchestration Services** - A2A Client/Server + RPC plugins for complex AI workflows

## Getting Started

```bash
npm install @arifwidianto/msa-core
npm install @arifwidianto/msa-plugin-http @arifwidianto/msa-plugin-websocket  # Traditional services
npm install @arifwidianto/msa-plugin-mcp @arifwidianto/msa-plugin-a2a        # AI protocol support
npm install @arifwidianto/msa-plugin-langchain                              # LLM integration
```

Build once, deploy anywhere. Let your requirements drive the architecture, not the other way around. Whether you're building traditional microservices or cutting-edge AI agents, MSA adapts to your needs with TypeScript reliability and AI-first capabilities.

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Available Scripts

The monorepo uses Lerna for package management. The following scripts are available:

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run clean` | Clean build artifacts |
| `npm run dev` | Start development mode with file watching |
| `npm run test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint all packages |
| `npm run bootstrap` | Bootstrap all packages (install dependencies) |
| `npm run release` | Create a new release with Lerna |

### Package Development

Each package has its own scripts that can be run individually:

```bash
# Example: Build a specific package
cd packages/plugin-http
npm run build

# Run tests for a specific package
npm run test
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
