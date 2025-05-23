import WebSocket from 'ws';
import { MCPRequest, MCPResponse, MCPMessage, MCPContext } from './mcp-types';
import { Logger } from '@arifwidianto/msa-core'; // Assuming Logger is available and configured

export class MCPClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private pendingRequests: Map<string, { resolve: (response: MCPResponse) => void, reject: (error: Error) => void }> = new Map();
  private onMessageHandler?: (message: MCPMessage) => void;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;
  private autoReconnect: boolean = true; // Or make this configurable
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5; // Example
  private reconnectInterval: number = 5000; // 5 seconds, example

  constructor(serverUrl: string, autoReconnect: boolean = true, maxReconnectAttempts: number = 5, reconnectInterval: number = 5000) {
    this.serverUrl = serverUrl;
    this.autoReconnect = autoReconnect;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectInterval = reconnectInterval;
    Logger.info(`MCPClient initialized for server URL: ${serverUrl}`);
  }

  public connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If a connection attempt is already in progress, return that promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;

      Logger.info(`MCPClient: Connecting to ${this.serverUrl}...`);
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        Logger.info(`MCPClient: Successfully connected to ${this.serverUrl}.`);
        this.reconnectAttempts = 0; // Reset on successful connection
        this.connectionResolve?.();
        this.connectionResolve = null;
        this.connectionReject = null;
        this.connectionPromise = null; // Clear promise for next connect attempt
      });

      this.ws.on('message', (data) => this.handleMessage(data));

      this.ws.on('error', (err) => {
        Logger.error(`MCPClient: WebSocket error: ${err.message}`);
        if (this.connectionPromise) {
          this.connectionReject?.(err);
          this.connectionResolve = null;
          this.connectionReject = null;
          this.connectionPromise = null;
        }
        // Error event is often followed by 'close'. Reconnection logic is in 'close'.
      });

      this.ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'No reason given';
        Logger.info(`MCPClient: WebSocket connection closed. Code: ${code}, Reason: ${reasonStr}`);
        this.ws = null; // Clear WebSocket instance

        // Reject pending requests on close
        this.pendingRequests.forEach((handler, requestId) => {
          handler.reject(new Error(`MCPClient: Connection closed. Request ${requestId} failed.`));
        });
        this.pendingRequests.clear();

        if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          Logger.info(`MCPClient: Attempting to reconnect in ${this.reconnectInterval / 1000}s... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => {
            this.connect().catch(reconnectError => {
              Logger.error(`MCPClient: Reconnect attempt ${this.reconnectAttempts} failed: ${reconnectError.message}`);
            });
          }, this.reconnectInterval);
        } else if (this.autoReconnect && this.connectionPromise) {
          Logger.error(`MCPClient: Max reconnect attempts (${this.maxReconnectAttempts}) reached. Will not reconnect further.`);
          this.connectionReject?.(new Error(`MCPClient: Connection closed. Code: ${code}, Reason: ${reasonStr}`));
          this.connectionResolve = null;
          this.connectionReject = null;
          this.connectionPromise = null;
        }
      });
    });
    return this.connectionPromise;
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as MCPMessage;
      Logger.debug(`MCPClient: Received message: ${JSON.stringify(message)}`);

      if (message.type === 'response' && this.pendingRequests.has(message.requestId)) {
        const handler = this.pendingRequests.get(message.requestId);
        if (message.status === 'success') {
          handler?.resolve(message);
        } else {
          const errorMsg = message.error ? `${message.error.code}: ${message.error.message}` : 'Unknown error';
          handler?.reject(new Error(`MCP Server Error: ${errorMsg}`));
        }
        this.pendingRequests.delete(message.requestId);
      } else if (this.onMessageHandler) {
        this.onMessageHandler(message); // For other messages or server pushes
      } else {
        Logger.warn(`MCPClient: Received unhandled message or no handler for response ID ${message.type === 'response' ? message.requestId : 'N/A'}`);
      }
    } catch (error) {
      Logger.error(`MCPClient: Error handling incoming message: ${error instanceof Error ? error.message : String(error)}. Data: ${data.toString()}`);
    }
  }

  public async sendRequest(action: string, payload: any, context?: MCPContext): Promise<MCPResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      Logger.warn(`MCPClient: Not connected. Attempting to connect before sending request for action: ${action}`);
      // Attempt to connect if not connected. This might be too implicit for some use cases.
      // Consider requiring explicit connect() call before sendRequest.
      await this.connect(); // Wait for connection
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { // Check again after connect attempt
        throw new Error('MCPClient: Connection failed. Cannot send request.');
      }
    }

    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2); // More robust unique ID
    const request: MCPRequest = {
      messageId: requestId,
      protocolVersion: '1.0',
      timestamp: new Date().toISOString(),
      type: 'request',
      action,
      payload,
      context,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          Logger.warn(`MCPClient: Request ${requestId} (action: ${action}) timed out.`);
          this.pendingRequests.get(requestId)?.reject(new Error(`Request ${requestId} timed out`));
          this.pendingRequests.delete(requestId);
        }
      }, 30000); // 30s timeout, make configurable

      // Create wrapper functions that clear the timeout
      const finish = (cb: (v?: any) => void) => (arg: any) => {
        clearTimeout(timer);
        cb(arg);
      };

      this.pendingRequests.set(requestId, {
        resolve: finish(resolve),
        reject: finish(reject)
      });

      Logger.debug(`MCPClient: Sending request: ${JSON.stringify(request)}`);
      this.ws!.send(JSON.stringify(request), (err) => {
        if (err) {
          Logger.error(`MCPClient: Error sending request ${requestId}: ${err.message}`);
          this.pendingRequests.delete(requestId);
          finish(reject)(err);
        }
      });
    });
  }

  public setOnMessageHandler(handler: (message: MCPMessage) => void): void {
    this.onMessageHandler = handler;
  }

  public close(): void {
    this.autoReconnect = false; // Prevent reconnection on manual close
    if (this.ws) {
      Logger.info(`MCPClient: Manually closing connection to ${this.serverUrl}.`);
      this.ws.close();
    } else {
      Logger.info(`MCPClient: No active connection to close for ${this.serverUrl}.`);
    }
  }

  public getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }
}
