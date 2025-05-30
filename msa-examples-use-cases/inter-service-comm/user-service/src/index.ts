import { Service, Logger, PluginConfig, IPlugin } from '@arifwidianto/msa-core';
import { HttpPlugin } from '@arifwidianto/msa-plugin-http';
import { Request, Response } from 'express';

const USER_SERVICE_PORT = 3002;

interface User {
  id: number;
  name: string;
  email?: string; // Optional field
}

// In-memory user store
const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie' },
];

async function main() {
  Logger.info('Starting User Service...');

  const service = new Service();
  const httpPlugin = new HttpPlugin();

  const httpConfig: PluginConfig = { port: USER_SERVICE_PORT };
  service.registerPlugin(httpPlugin);

  // API Endpoint: GET /users/:id
  httpPlugin.registerRoute('get', '/users/:id', (req: Request, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    const user = users.find(u => u.id === userId);

    if (user) {
      Logger.info(`User Service: Found user ${userId}: ${user.name}`);
      res.status(200).json(user);
    } else {
      Logger.warn(`User Service: User ${userId} not found.`);
      res.status(404).json({ error: `User with ID ${userId} not found.` });
    }
  });
  
  // Optional: Root path handler
  httpPlugin.onMessage((msg) => {
    const payload = msg as unknown as { request: Request, response: Response}; // Assuming HttpMessagePayload structure
    if (payload.request.path === '/') {
        payload.response.json({ message: 'User Service is active. Use /users/:id to get user details.' });
    } else {
        // Let Express default handling (404) or HttpPlugin's catch-all take over
        if (!payload.response.headersSent) {
            payload.response.status(404).json({ error: 'User Service: Endpoint not found.'});
        }
    }
  });

  try {
    await service.initializeService({
      [httpPlugin.name]: httpConfig,
    });
    await service.startService();

    Logger.info(`User Service with HTTP API listening on port ${USER_SERVICE_PORT}`);
    Logger.info('User Service started successfully.');

  } catch (error) {
    Logger.error('Failed to start the User Service:', error);
    process.exit(1);
  }
}

main().catch(error => {
  Logger.error('Unhandled error in User Service main execution:', error);
  process.exit(1);
});
