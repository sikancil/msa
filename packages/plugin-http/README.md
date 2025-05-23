# MSA HTTP Plugin (@arifwidianto/msa-plugin-http)

This plugin provides an HTTP server transport for the MSA (Microservice Architecture) framework. It uses Express.js to create and manage an HTTP server, allowing services to expose RESTful APIs and web endpoints with minimal configuration.

## Features

* Complete Express.js server with middleware support
* Configurable port and host settings
* Simple route registration API
* JSON parsing middleware included by default
* Request logging for better debugging
* Access to the underlying Express app for advanced configuration
* Implements both `IPlugin` and `ITransport` interfaces

## Installation

```bash
npm install @arifwidianto/msa-plugin-http @arifwidianto/msa-core express
```

## Quick Start

```typescript
import { Service } from '@arifwidianto/msa-core';
import { HttpPlugin } from '@arifwidianto/msa-plugin-http';
import { Request, Response } from 'express';

async function main() {
  const service = new Service();
  const httpPlugin = new HttpPlugin();
  
  service.registerPlugin(httpPlugin);
  
  await service.initializeService({
    'msa-plugin-http': {
      port: 3000,
      host: 'localhost'
    }
  });
  
  // Register routes before starting the service
  httpPlugin.registerRoute('get', '/api/hello', (req: Request, res: Response) => {
    res.json({ message: 'Hello from MSA HTTP plugin!' });
  });
  
  httpPlugin.registerRoute('post', '/api/echo', (req: Request, res: Response) => {
    res.json({
      received: req.body,
      timestamp: new Date().toISOString()
    });
  });
  
  await service.startService();
  console.log('HTTP server started on http://localhost:3000');
}

main().catch(console.error);
```

## Configuration

The HTTP Plugin can be configured during service initialization:

```typescript
interface HttpPluginConfig {
  port: number;      // Required: The port number for the HTTP server to listen on.
  host?: string;    // Optional: The host address (e.g., '0.0.0.0' or 'localhost'). Defaults to 'localhost'.
}
```

### Example Configuration

```typescript
{
  'msa-plugin-http': {
    port: 8080,          // Listen on port 8080
    host: '0.0.0.0'      // Listen on all network interfaces
  }
}
```

## Basic Usage

### Registering a Route

After the `HttpPlugin` is initialized, you can register routes using its `registerRoute` method.

```typescript
import { Request, Response } from 'express';

// Assuming httpPlugin is an instance of HttpPlugin that has been initialized
httpPlugin.registerRoute('get', '/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello, World!' });
});

httpPlugin.registerRoute('post', '/echo', (req: Request, res: Response) => {
  res.json(req.body);
});
```

This will create:
*   A `GET` endpoint at `/hello` that returns a JSON greeting.
*   A `POST` endpoint at `/echo` that echoes the JSON body it receives.

### Accessing the Express App

For more advanced configurations or direct access to the Express app instance, you can use the `getExpressApp()` method:

```typescript
const expressApp = httpPlugin.getExpressApp();
if (expressApp) {
  // Add custom middleware, configure static files, etc.
  // expressApp.use(customMiddleware);
}
```

## API Reference

### registerRoute(method, path, handler)

Registers an HTTP route with the Express app:

```typescript
import { Request, Response } from 'express';

// Register a GET endpoint
httpPlugin.registerRoute('get', '/api/users', (req: Request, res: Response) => {
  const users = [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }];
  res.json(users);
});

// Register a POST endpoint with request body
httpPlugin.registerRoute('post', '/api/users', (req: Request, res: Response) => {
  const newUser = req.body;
  // Process new user data
  res.status(201).json({ id: 3, ...newUser });
});
```

Supported HTTP methods:
- `get`
- `post`
- `put`
- `delete`
- `patch`
- `options`
- `head`
- `all`

### getExpressApp()

Access the underlying Express app for advanced configuration:

```typescript
const expressApp = httpPlugin.getExpressApp();
if (expressApp) {
  // Add custom middleware
  expressApp.use('/static', express.static('public'));
  
  // Add global error handler
  expressApp.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });
}
```

## Adding Custom Middleware

You can add custom middleware to the Express app using the `getExpressApp()` method:

```typescript
import { Service } from '@arifwidianto/msa-core';
import { HttpPlugin } from '@arifwidianto/msa-plugin-http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

async function main() {
  const service = new Service();
  const httpPlugin = new HttpPlugin();
  
  service.registerPlugin(httpPlugin);
  await service.initializeService({ 'msa-plugin-http': { port: 3000 } });
  
  // Add custom middleware
  const app = httpPlugin.getExpressApp();
  if (app) {
    // CORS support
    app.use(cors());
    
    // Security headers
    app.use(helmet());
    
    // Custom logging
    app.use((req, res, next) => {
      console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
      next();
    });
  }
  
  await service.startService();
}
```

## ITransport Implementation

The HTTP plugin implements `ITransport` with the following behavior:

- `listen(port)`: Configures the port the server will use when `start()` is called.
- `send(message)`: Not typically used for a server plugin but could be extended to make outbound HTTP requests.
- `onMessage(handler)`: A generic message handler can be registered, but `registerRoute` is generally preferred.
- `close()`: Equivalent to `stop()` - closes the HTTP server.

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
