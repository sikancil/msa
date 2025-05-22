import { IPlugin, PluginConfig, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { WebSocketPluginConfig } from './WebSocketPluginConfig';

export class WebSocketPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-websocket';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private wss: WebSocketServer | null = null;
  private config: WebSocketPluginConfig = { port: 3001 }; // Default config
  private messageHandler: MessageHandler | null = null;
  private clients: Set<WebSocket> = new Set();

  public async initialize(config: PluginConfig): Promise<void> {
    this.config = { ...this.config, ...config } as WebSocketPluginConfig;
    if (!this.config.port) {
      throw new Error('WebSocket Plugin: Port must be configured.');
    }
    Logger.info(`WebSocket Plugin "${this.name}" initialized with config: ${JSON.stringify(this.config)}`);
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host || 'localhost', // Default to localhost if not specified
          path: this.config.path, // Optional path, e.g., /ws
        });

        this.wss.on('listening', () => {
          Logger.info(`WebSocket Plugin "${this.name}" started. Listening on ws://${this.config.host || 'localhost'}:${this.config.port}${this.config.path || ''}`);
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.clients.add(ws);
          Logger.info(`WebSocket Plugin: Client connected. Total clients: ${this.clients.size}`);

          ws.on('message', (data: RawData) => {
            Logger.debug(`WebSocket Plugin: Received message: ${data.toString()}`);
            if (this.messageHandler) {
              try {
                // Assuming Message can be a string or Buffer directly for simplicity
                // In a real scenario, data might need parsing or transformation
                this.messageHandler(data.toString() as Message);
              } catch (error) {
                Logger.error(`WebSocket Plugin: Error in message handler: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          });

          ws.on('close', (code, reason) => {
            this.clients.delete(ws);
            Logger.info(`WebSocket Plugin: Client disconnected. Code: ${code}, Reason: ${reason.toString()}. Total clients: ${this.clients.size}`);
          });

          ws.on('error', (error: Error) => {
            Logger.error(`WebSocket Plugin: Error on client WebSocket: ${error.message}`);
            // ws.close(); // Optionally close the connection on error
            // this.clients.delete(ws); // Ensure client is removed
          });
        });

        this.wss.on('error', (error: Error) => {
          Logger.error(`WebSocket Plugin "${this.name}" failed to start or encountered a server error: ${error.message}`);
          reject(error);
        });

      } catch (error) {
        Logger.error(`WebSocket Plugin "${this.name}" critical error during start: ${error instanceof Error ? error.message : String(error)}`);
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    Logger.info(`WebSocket Plugin "${this.name}" stopping...`);
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
        this.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.close(1000, 'Server shutting down'); // 1000 is normal closure
          }
        });
        this.clients.clear();

        this.wss.close(() => {
          Logger.info(`WebSocket Plugin "${this.name}" stopped.`);
          this.wss = null;
          resolve();
        });
      } else {
        Logger.info(`WebSocket Plugin "${this.name}" was not running.`);
        resolve();
      }
    });
  }

  public async cleanup(): Promise<void> {
    // Any other cleanup tasks, like releasing external resources if any
    Logger.info(`WebSocket Plugin "${this.name}" cleaned up.`);
  }

  // --- ITransport Implementation ---

  public async listen(portOrPath: number | string): Promise<void> {
    // In this standalone implementation, 'listen' is effectively handled by 'start'.
    // We ensure the port from config is used.
    if (typeof portOrPath === 'number') {
      this.config.port = portOrPath;
    } else if (typeof portOrPath === 'string' && !isNaN(parseInt(portOrPath, 10))) {
      this.config.port = parseInt(portOrPath, 10);
    } else if (typeof portOrPath === 'string') {
        // If it's a string that's not a number, it could be a path, but our config separates path.
        // For simplicity, we'll assume if it's a string and not a number, it's an error for port.
        Logger.warn(`WebSocket Plugin: Invalid port for listen: ${portOrPath}. Using configured port: ${this.config.port}`);
    }
    // The actual listening happens in start(). This method primarily ensures config is updated if called.
    Logger.info(`WebSocket Plugin: listen() called. Port configured to ${this.config.port}. Server will start on this port via start().`);
  }

  public async send(message: Message): Promise<void> {
    if (!this.wss) {
      Logger.warn('WebSocket Plugin: Server not started. Cannot send message.');
      return Promise.reject(new Error('WebSocket server not running.'));
    }

    if (this.clients.size === 0) {
      Logger.info('WebSocket Plugin: No clients connected. Message not sent.');
      return Promise.resolve();
    }

    Logger.debug(`WebSocket Plugin: Broadcasting message to ${this.clients.size} clients: ${message}`);
    let sendCount = 0;
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          // Assuming message is a string or Buffer-like.
          // For complex objects, JSON.stringify might be needed.
          client.send(message);
          sendCount++;
        } catch (error) {
          Logger.error(`WebSocket Plugin: Error sending message to a client: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    Logger.info(`WebSocket Plugin: Message broadcasted to ${sendCount} clients.`);
    return Promise.resolve();
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    Logger.info('WebSocket Plugin: Message handler registered via ITransport.onMessage().');
  }

  public async close(): Promise<void> {
    await this.stop();
  }

  // --- WebSocket Specific Methods (Optional) ---

  /**
   * Sends a message to a specific client.
   * This requires identifying clients, e.g., by an ID assigned on connection.
   * For simplicity, this is not fully implemented here but shows a conceptual extension.
   * @param clientId The identifier of the client.
   * @param message The message to send.
   */
  public async sendToClient(clientId: string, message: Message): Promise<void> {
    // This is a placeholder. A real implementation would need a map of clientId -> WebSocket.
    Logger.warn(`WebSocket Plugin: sendToClient() is conceptual. Client ID management not implemented. Message to ${clientId} not sent.`);
    return Promise.reject(new Error('sendToClient not fully implemented.'));
  }

  /**
   * Returns the underlying WebSocketServer instance for advanced configuration if needed.
   */
  public getWebSocketServer(): WebSocketServer | null {
    return this.wss;
  }
}
