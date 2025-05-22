# MSA HTTP Plugin (@arifwidianto/msa-plugin-http)

This plugin provides an HTTP server transport for the MSA (Microservice Architecture) framework. It uses Express.js to create and manage an HTTP server, allowing other plugins or the main service to register routes and handle HTTP requests.

## Features

*   Starts and stops an HTTP server.
*   Configurable port and host.
*   Allows registration of Express.js-compatible routes.
*   Basic JSON body parsing middleware included by default.
*   Implements `IPlugin` and parts of `ITransport` from `@arifwidianto/msa-core`.

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package.

## Configuration

The `HttpPlugin` can be configured during the service initialization phase. The configuration is passed to its `initialize` method.

### `HttpPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

export interface HttpPluginConfig extends PluginConfig {
  port: number;      // Required: The port number for the HTTP server to listen on.
  host?: string;    // Optional: The host address (e.g., '0.0.0.0' or 'localhost'). Defaults to 'localhost'.
}
```

### Example Configuration

```typescript
// In your main service setup
import { Service } from '@arifwidianto/msa-core';
import { HttpPlugin, HttpPluginConfig } from '@arifwidianto/msa-plugin-http';

const service = new Service();
const httpPlugin = new HttpPlugin();

const pluginConfigs = {
  'msa-plugin-http': {
    port: 8080,
    host: '0.0.0.0'
  } as HttpPluginConfig
};

service.registerPlugin(httpPlugin);
await service.initializeService(pluginConfigs);
await service.startService();
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

## ITransport Implementation Notes

While `HttpPlugin` implements `ITransport` from `@arifwidianto/msa-core`, some `ITransport` methods have specific interpretations in the context of an HTTP server:

*   `listen(portOrPath)`: Configures the port the server will use when `start()` is called.
*   `send(message)`: Not directly implemented for a server-focused plugin. Could be used if the plugin also needed to make outbound HTTP requests.
*   `onMessage(handler)`: A generic message handler can be registered, but `registerRoute` is preferred for typical HTTP API development.
*   `close()`: Equivalent to `stop()`.

This plugin focuses on providing the server-side HTTP capabilities.
