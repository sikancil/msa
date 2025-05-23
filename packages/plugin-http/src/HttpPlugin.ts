import { IPlugin, PluginConfig, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core';
import express, { Express, RequestHandler, Router } from 'express';
import http from 'http';
import { HttpPluginConfig } from './HttpPluginConfig';

export class HttpPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-http';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private app: Express | null = null;
  private server: http.Server | null = null;
  private config: HttpPluginConfig = { port: 3000 }; // Default config
  private messageHandler: MessageHandler | null = null; // For ITransport

  public async initialize(config: PluginConfig): Promise<void> {
    this.config = { ...this.config, ...config } as HttpPluginConfig;
    if (!this.config.port) {
      throw new Error('HTTP Plugin: Port must be configured.');
    }

    this.app = express();
    this.app.use(express.json()); // Middleware for parsing JSON bodies

    // Basic logging middleware
    this.app.use((req, res, next) => {
      Logger.info(`HTTP Request: ${req.method} ${req.url}`);
      next();
    });

    Logger.info(`HTTP Plugin "${this.name}" initialized with config: ${JSON.stringify(this.config)}`);
  }

  public async start(): Promise<void> {
    if (!this.app) {
      throw new Error('HTTP Plugin: Not initialized. Call initialize() first.');
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

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
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
        Logger.info(`HTTP Plugin "${this.name}" was not running.`);
        resolve();
      }
    });
  }

  public async cleanup(): Promise<void> {
    this.app = null;
    // Any other cleanup tasks
    Logger.info(`HTTP Plugin "${this.name}" cleaned up.`);
  }

  // --- ITransport Implementation (Simplified for HTTP context) ---

  // For an HTTP plugin, listen is effectively covered by start()
  public async listen(portOrPath: number | string): Promise<void> {
    if (typeof portOrPath === 'number') {
      this.config.port = portOrPath;
    } else if (typeof portOrPath === 'string' && !isNaN(parseInt(portOrPath,10))) {
      this.config.port = parseInt(portOrPath,10);
    } else {
        Logger.warn(`HTTP Plugin: Invalid port/path for listen: ${portOrPath}. Using configured port: ${this.config.port}`);
    }
    // `start()` will use this.config.port
    // This method is here to satisfy ITransport but might need refinement for HTTP context
    // Or, HttpPlugin might not directly implement ITransport if another class handles it.
  }

  // Sending a generic "message" doesn't directly map to HTTP client requests.
  // This would be more for server-to-server communication or if the plugin itself acts as a client.
  // For now, it's a placeholder.
  public async send(message: Message): Promise<void> {
    Logger.warn('HTTP Plugin: ITransport.send() is not meaningfully implemented for a server-focused HTTP plugin.');
    // If this plugin were to make HTTP requests, this is where it would go.
    return Promise.resolve();
  }

  // For HTTP, "onMessage" typically means registering route handlers.
  // This ITransport method is a bit generic. We'll use registerRoute for more specific HTTP handling.
  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    Logger.info('HTTP Plugin: Generic message handler registered via ITransport.onMessage(). Specific route handlers should be preferred.');
    // A generic handler could be used for a default route, e.g. this.app.use((req, res) => this.messageHandler(...));
    // However, this is usually too broad for HTTP APIs.
  }

  // For an HTTP plugin, close is covered by stop()
  public async close(): Promise<void> {
    await this.stop();
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
