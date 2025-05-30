import { IPlugin, PluginConfig, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core';
import express, { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { HttpPluginConfig } from './HttpPluginConfig';

// Define a specific message structure for HTTP
// Note: msa-core's Message type is 'unknown', so we'll cast.
export interface HttpMessagePayload {
  request: Request;
  response: Response;
  // Potentially add other relevant details like parsed body, query params if pre-processed
}

export class HttpPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-http';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = []; // Changed to string[]

  private app: Express | null = null;
  private server: http.Server | null = null;
  private config: HttpPluginConfig = { port: 3000 }; // Default config
  private messageHandler: MessageHandler | null = null; // For ITransport

  public async initialize(config: PluginConfig, _dependencies: Map<string, IPlugin>): Promise<void> {
    this.config = { ...this.config, ...config } as HttpPluginConfig;
    if (!this.config.port) {
      throw new Error('HTTP Plugin: Port must be configured.');
    }

    this.app = express();
    this.app.use(express.json());

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      Logger.info(`HTTP Request: ${req.method} ${req.url}`);
      next();
    });
    
    // If a message handler was registered before initialize (e.g. via a setter), set it up.
    this.setupCatchAllHandler(); 

    Logger.info(`HTTP Plugin "${this.name}" initialized with config: ${JSON.stringify(this.config)}`);
  }

  private setupCatchAllHandler(): void {
    if (this.app && this.messageHandler && !this.app._router.stack.find((layer: any) => layer.name === 'genericHttpMessageHandler')) {
        // Add as a final middleware to catch all requests not handled by specific routes.
        // Give it a name to prevent duplicate additions if called multiple times.
        const genericHttpMessageHandler = (req: Request, res: Response, next: NextFunction) => {
            if (res.headersSent) {
                return next();
            }
            if (this.messageHandler) {
                const httpMessage: HttpMessagePayload = { request: req, response: res };
                try {
                    this.messageHandler(httpMessage as unknown as Message);
                } catch (err) {
                    Logger.error(`HTTP Plugin: Error in generic message handler: ${err instanceof Error ? err.message : String(err)}`);
                    if (!res.headersSent) {
                        res.status(500).send('Internal Server Error from generic handler');
                    }
                }
            } else {
                if (!res.headersSent) {
                    res.status(404).send('Not Found: No specific route or generic handler configured.');
                }
            }
        };
        Object.defineProperty(genericHttpMessageHandler, 'name', { value: 'genericHttpMessageHandler', writable: false });
        this.app.use(genericHttpMessageHandler);
        Logger.info('HTTP Plugin: Catch-all message handler setup.');
    }
  }

  public async start(): Promise<void> {
    if (!this.app) {
      throw new Error('HTTP Plugin: Not initialized. Call initialize() first.');
    }
    if (this.config.port === undefined) {
      throw new Error('HTTP Plugin: Port not configured. Cannot start.');
    }
    // If server is not already listening, call listen.
    if (!this.server?.listening) {
        await this.listen(this.config.port);
    } else {
        Logger.info(`HTTP Plugin "${this.name}" is already listening on port ${this.config.port}.`);
    }
  }

  public async stop(): Promise<void> {
    await this.close(); // Delegate to ITransport's close
  }

  public async cleanup(): Promise<void> {
    Logger.info(`HTTP Plugin "${this.name}" cleaning up...`);
    await this.close(); // Ensure server is stopped
    this.app = null;
    // Any other cleanup tasks
    Logger.info(`HTTP Plugin "${this.name}" cleaned up.`);
  }

  // --- ITransport Implementation ---

  public async listen(portOrPath: number | string): Promise<void> {
    if (!this.app) {
      throw new Error('HTTP Plugin: Not initialized. Call initialize() first.');
    }

    let resolvedPort: number;
    if (typeof portOrPath === 'number') {
      resolvedPort = portOrPath;
    } else if (typeof portOrPath === 'string' && !isNaN(parseInt(portOrPath, 10))) {
      resolvedPort = parseInt(portOrPath, 10);
    } else if (this.config.port !== undefined) {
      Logger.warn(`HTTP Plugin: Invalid port/path for listen: "${portOrPath}". Using configured port: ${this.config.port}`);
      resolvedPort = this.config.port;
    } else {
      throw new Error(`HTTP Plugin: Invalid or no port specified for listen: "${portOrPath}" and no default port configured.`);
    }
    this.config.port = resolvedPort; // Update config with the port being used

    if (this.server?.listening) {
      if (this.config.port === (this.server.address() as AddressInfo)?.port) {
        Logger.info(`HTTP Plugin "${this.name}" is already listening on port ${this.config.port}.`);
        return Promise.resolve();
      } else {
        Logger.warn(`HTTP Plugin "${this.name}" is already listening on a different port. Attempting to stop and restart on port ${this.config.port}.`);
        await this.close(); // Stop the server before restarting on a new port
      }
    }
    
    return new Promise((resolve, reject) => {
      this.server = this.app!.listen(this.config.port, this.config.host || 'localhost', () => {
        const address = this.server?.address();
        const port = typeof address === 'string' ? address : address?.port;
        Logger.info(`HTTP Plugin "${this.name}" started. Listening on ${this.config.host || 'localhost'}:${port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        Logger.error(`HTTP Plugin "${this.name}" failed to start: ${error.message}`);
        reject(error);
      });
    });
  }

  // Sending a generic "message" doesn't directly map to HTTP client requests.
  // This would be more for server-to-server communication or if the plugin itself acts as a client.
  // For now, it's a placeholder.
  public async send(_message: Message): Promise<void> {
    Logger.warn('HTTP Plugin: ITransport.send() is not meaningfully implemented for a server-focused HTTP plugin.');
    // If this plugin were to make HTTP requests, this is where it would go.
    return Promise.resolve();
  }

  // This ITransport method registers a handler.
  // The catch-all middleware is now set up via setupCatchAllHandler.
  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    Logger.info('HTTP Plugin: Generic message handler registered via ITransport.onMessage().');
    // Ensure catch-all is (re)configured if app exists, or it will be configured during initialize.
    this.setupCatchAllHandler();
  }

  // ITransport.close: Stops the HTTP server. Also called by IPlugin.stop.
  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server && this.server.listening) {
        Logger.info(`HTTP Plugin "${this.name}" stopping...`);
        this.server.close((err) => {
          if (err) {
            Logger.error(`Error stopping HTTP server for plugin "${this.name}": ${err.message}`);
            return reject(err);
          }
          Logger.info(`HTTP Plugin "${this.name}" stopped.`);
          this.server = null;
          resolve();
        });
      } else {
        Logger.info(`HTTP Plugin "${this.name}" was not running or already stopped.`);
        this.server = null; // Ensure server is nullified
        resolve();
      }
    });
  }

  // --- HTTP Specific Methods ---

  /**
   * Registers a new HTTP route with the specified method, path, and handler.
   * 
   * @param method - The HTTP method to use (e.g., 'get', 'post', 'put', 'delete', 'patch').
   *                 Any method that exists as a property on the Express app object will be accepted.
   *                 Case-insensitive (will be converted to lowercase).
   * @param path - The URL path pattern to match for this route.
   * @param handler - The function that will handle requests to this route.
   * @throws {Error} If the plugin is not initialized or if the HTTP method is invalid
   *                 (i.e., not available as a method on the Express app object).
   * 
   * @remarks
   * Note that this method doesn't perform explicit validation against a whitelist of
   * supported HTTP methods. It will attempt to use any method name that matches a property
   * on the Express app object, which could lead to unexpected behavior if method names
   * contain typos or reference unsupported methods.
   */
  public registerRoute(method: string, path: string, handler: RequestHandler): void {
    if (!this.app) {
      throw new Error('HTTP Plugin: Not initialized. Cannot register route.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = (this.app as any)[method.toLowerCase()];
    if (!router) {
      throw new Error(`HTTP Plugin: Invalid HTTP method "${method}".`);
    }
    router.call(this.app, path, handler);
    Logger.info(`HTTP Plugin: Route registered: ${method.toUpperCase()} ${path}`);
  }

  /**
   * Returns the underlying Express app instance for advanced configuration if needed.
   */
  public getExpressApp(): Express | null {
    return this.app;
  }
}
