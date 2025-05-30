import { IPlugin, PluginConfig, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core'; // IPluginDependency removed
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { WebSocketPluginConfig } from './WebSocketPluginConfig';

// Define a specific message structure for WebSocket messages
// This allows the handler to know which client sent the message.
export interface WebSocketMessagePayload {
  clientId: string;
  client: WebSocket; // The actual WebSocket client instance
  data: RawData;    // RawData from the 'ws' library
  isBinary: boolean;
}

export class WebSocketPlugin implements IPlugin, ITransport { // Class definition continues
  public readonly name = 'msa-plugin-websocket';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private wss: WebSocketServer | null = null;
  private config: WebSocketPluginConfig = { port: 3001 }; // Default config
  private messageHandler: MessageHandler | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private nextClientId = 0;
  
  public async initialize(config: PluginConfig, _dependencies: Map<string, IPlugin>): Promise<void> {
    this.config = { ...this.config, ...config } as WebSocketPluginConfig;
    // Logger.debug(`Plugin ${this.name} received dependencies: ${Array.from(_dependencies.keys())}`);
    if (!this.config.port) {
      throw new Error('WebSocket Plugin: Port must be configured.');
    }
    Logger.info(`WebSocket Plugin "${this.name}" initialized with config: ${JSON.stringify(this.config)}`);
  }

  public async start(): Promise<void> {
    if (!this.config.port) {
        throw new Error('WebSocket Plugin: Port not configured. Cannot start.');
    }
    if (this.wss?.options.port) { // Check if server is already configured/running
        Logger.info(`WebSocket Plugin "${this.name}" is already listening or configured for port ${this.wss.options.port}.`);
        return;
    }
    await this.listen(this.config.port);
  }
  
  public async stop(): Promise<void> {
    await this.close(); // Delegate to ITransport's close
  }

  public async cleanup(): Promise<void> {
    Logger.info(`WebSocket Plugin "${this.name}" cleaning up...`);
    await this.close(); // Ensure server and clients are closed
    Logger.info(`WebSocket Plugin "${this.name}" cleaned up.`);
  }

  // --- ITransport Implementation ---

  public async listen(portOrPath: number | string): Promise<void> {
    let resolvedPort: number;
    if (typeof portOrPath === 'number') {
      resolvedPort = portOrPath;
    } else if (typeof portOrPath === 'string' && !isNaN(parseInt(portOrPath, 10))) {
      resolvedPort = parseInt(portOrPath, 10);
    } else if (this.config.port !== undefined) {
      Logger.warn(`WebSocket Plugin: Invalid port/path for listen: "${portOrPath}". Using configured port: ${this.config.port}`);
      resolvedPort = this.config.port;
    } else {
      throw new Error(`WebSocket Plugin: Invalid or no port specified for listen: "${portOrPath}" and no default port configured.`);
    }
    this.config.port = resolvedPort;

    if (this.wss) {
        if (this.wss.options.port === this.config.port) {
            Logger.info(`WebSocket Plugin "${this.name}" is already listening on ws://${this.config.host || 'localhost'}:${this.config.port}${this.config.path || ''}`);
            return Promise.resolve();
        } else {
            Logger.warn(`WebSocket Plugin "${this.name}" is already configured for a different port. Attempting to stop and restart.`);
            await this.close();
        }
    }

    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host || 'localhost',
          path: this.config.path,
        });

        this.wss.on('listening', () => {
          Logger.info(`WebSocket Plugin "${this.name}" started. Listening on ws://${this.config.host || 'localhost'}:${this.config.port}${this.config.path || ''}`);
          resolve();
        });

        this.wss.on('connection', (ws: WebSocket & { id?: string }) => {
          const clientId = `ws-client-${this.nextClientId++}`;
          ws.id = clientId; // Assign a unique ID to the client
          this.clients.set(clientId, ws);
          Logger.info(`WebSocket Plugin: Client ${clientId} connected. Total clients: ${this.clients.size}`);

          ws.on('message', (data: RawData, isBinary: boolean) => {
            Logger.debug(`WebSocket Plugin: Received message from ${clientId}: ${isBinary ? '[Binary Data]' : data.toString()}`);
            if (this.messageHandler) {
              const payload: WebSocketMessagePayload = { // Removed WebSocketPlugin. prefix
                clientId,
                client: ws,
                data,
                isBinary
              };
              try {
                this.messageHandler(payload as unknown as Message);
              } catch (error) {
                Logger.error(`WebSocket Plugin: Error in message handler for ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
          });

          ws.on('close', (code, reason) => {
            this.clients.delete(clientId);
            Logger.info(`WebSocket Plugin: Client ${clientId} disconnected. Code: ${code}, Reason: ${reason.toString()}. Total clients: ${this.clients.size}`);
          });

          ws.on('error', (error: Error) => {
            Logger.error(`WebSocket Plugin: Error on client ${clientId} WebSocket: ${error.message}`);
            ws.close(); // Ensure client connection is closed on error
            // this.clients.delete(clientId); // 'close' event will handle removal
          });
        });

        this.wss.on('error', (error: Error) => {
          Logger.error(`WebSocket Plugin "${this.name}" failed to start or encountered a server error: ${error.message}`);
          this.wss = null; // Ensure wss is nullified on error
          reject(error);
        });

      } catch (error) {
        Logger.error(`WebSocket Plugin "${this.name}" critical error during listen/start: ${error instanceof Error ? error.message : String(error)}`);
        this.wss = null; // Ensure wss is nullified
        reject(error);
      }
    });
  }

  public async send(message: Message, targetClientIds?: string[] | string): Promise<void> {
    if (!this.wss) {
      Logger.warn('WebSocket Plugin: Server not started. Cannot send message.');
      throw new Error('WebSocket server not running.');
    }

    const messageString = (typeof message === 'object' && message !== null && !(message instanceof Buffer)) 
                          ? JSON.stringify(message) 
                          : message as (string | Buffer); // Already string or Buffer

    if (targetClientIds) {
      const ids = Array.isArray(targetClientIds) ? targetClientIds : [targetClientIds];
      let sentToCount = 0;
      ids.forEach(clientId => {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          try {
            client.send(messageString);
            sentToCount++;
          } catch (error) {
            Logger.error(`WebSocket Plugin: Error sending message to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          Logger.warn(`WebSocket Plugin: Client ${clientId} not found or not open. Message not sent.`);
        }
      });
      if (sentToCount > 0) {
        Logger.debug(`WebSocket Plugin: Message sent to ${sentToCount} specified client(s).`);
      }
    } else { // Broadcast to all clients
      if (this.clients.size === 0) {
        Logger.info('WebSocket Plugin: No clients connected. Message not broadcast.');
        return;
      }
      Logger.debug(`WebSocket Plugin: Broadcasting message to ${this.clients.size} clients.`);
      let broadcastCount = 0;
      this.clients.forEach((client, clientId) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(messageString);
            broadcastCount++;
          } catch (error) {
            Logger.error(`WebSocket Plugin: Error broadcasting message to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      });
      if (broadcastCount > 0) {
        Logger.info(`WebSocket Plugin: Message broadcasted to ${broadcastCount} clients.`);
      }
    }
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    Logger.info('WebSocket Plugin: Message handler registered. It will be invoked with WebSocketMessagePayload.');
  }

  public async close(): Promise<void> {
    Logger.info(`WebSocket Plugin "${this.name}" stopping...`);
    return new Promise((resolve) => {
      if (this.wss) {
        this.clients.forEach((client, clientId) => {
          if (client.readyState === WebSocket.OPEN) {
            client.close(1000, 'Server shutting down');
            Logger.debug(`WebSocket Plugin: Closing client ${clientId}`);
          }
        });
        this.clients.clear();

        this.wss.close((err) => {
          if (err) {
            Logger.error(`WebSocket Plugin: Error stopping server: ${err.message}`);
          }
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

  // --- WebSocket Specific Methods (Optional) ---

  /**
   * Sends a message to a specific client.
   * This requires identifying clients, e.g., by an ID assigned on connection.
   * For simplicity, this is not fully implemented here but shows a conceptual extension.
   * @param clientId The identifier of the client (the one assigned in `on('connection')`).
   * @param message The message to send.
   */
  public async sendToClient(clientId: string, message: Message): Promise<void> {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        const messageString = (typeof message === 'object' && message !== null && !(message instanceof Buffer)) 
                              ? JSON.stringify(message) 
                              : message as (string | Buffer);
        client.send(messageString);
        Logger.debug(`WebSocket Plugin: Message sent to client ${clientId}.`);
      } catch (error) {
        Logger.error(`WebSocket Plugin: Error sending message to client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to indicate send failure
      }
    } else {
      const errorMsg = `WebSocket Plugin: Client ${clientId} not found or connection not open.`;
      Logger.warn(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Returns the underlying WebSocketServer instance for advanced configuration if needed.
   */
  public getWebSocketServer(): WebSocketServer | null {
    return this.wss;
  }
}
