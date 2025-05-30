import { MCPRequest, MCPResponse, MCPContext } from './mcp-types'; // MCPMessage removed
import { ITransport, Logger } from '@arifwidianto/msa-core'; // Added LoggerType import

// Define a simpler Logger interface for MCPServer if full MsaLogger is not directly available
// or assume MsaLogger can be passed in. For this implementation, we'll use MsaLogger type.
// If MsaLogger is not directly passed, a wrapper or a simpler logger might be used.

export type MCPRequestHandler = (request: MCPRequest, context: MCPContext) => Promise<Partial<MCPResponse>>;

export class MCPServer {
  private transport: ITransport;
  private requestHandlers: Map<string, MCPRequestHandler> = new Map();
  private logger: typeof Logger; // Use the LoggerType from msa-core

  private readonly offMessage?: () => void;

  constructor(transportPlugin: ITransport, logger: typeof Logger) {
    this.transport = transportPlugin;
    this.logger = logger;

    // The transport plugin should already be configured and started by the core Service.
    // The onMessage handler of the transport plugin is the entry point for MCPServer.
    const offResult = this.transport.onMessage(this.handleRawMessage.bind(this));
    this.offMessage = typeof offResult === 'function' ? offResult : undefined;
    this.logger.info('MCPServer initialized. Listening for messages on the provided transport.');
  }

  /**
   * Cleanup method to properly dispose of resources and event listeners
   */
  public close(): void {
    if (this.offMessage) {
      this.offMessage();
      this.logger.info('MCPServer: Removed message listener from transport.');
    }
    this.requestHandlers.clear();
    this.logger.info('MCPServer: Cleared all request handlers.');
  }

  private async handleRawMessage(rawMessage: unknown, senderId?: string): Promise<void> {
    // senderId might be provided by ITransport if it supports multiple clients (e.g., individual WebSockets)
    this.logger.debug('MCPServer: Received raw message from transport.', { rawMessage, senderId });
    try {
      const message = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (message.type === 'request') {
        const request = message as MCPRequest;
        this.logger.info('MCPServer: MCP Request received', { requestId: request.messageId, action: request.action, senderId });
        
        const handler = this.requestHandlers.get(request.action);
        let responsePayload: Partial<MCPResponse>;

        if (handler) {
          try {
            responsePayload = await handler(request, request.context || {});
          } catch (handlerError) {
            this.logger.error('MCPServer: Error in request handler', { requestId: request.messageId, action: request.action, error: handlerError });
            responsePayload = {
              status: 'error',
              error: { code: 'HANDLER_EXCEPTION', message: handlerError instanceof Error ? handlerError.message : String(handlerError) }
            };
          }
        } else {
          this.logger.warn('MCPServer: No handler found for action', { requestId: request.messageId, action: request.action });
          responsePayload = {
            status: 'error',
            error: { code: 'NO_HANDLER', message: `No handler registered for action: ${request.action}` }
          };
        }
        
        const response: MCPResponse = {
          messageId: `res-${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`, // Unique response ID
          protocolVersion: request.protocolVersion,
          timestamp: new Date().toISOString(),
          type: 'response',
          requestId: request.messageId,
          status: responsePayload.status || 'success', // Default to success if handler doesn't specify
          payload: responsePayload.payload,
          error: responsePayload.error,
          context: responsePayload.context // Handler can update context
        };
        
        // Send the response. If senderId is available and transport supports it, use it.
        // Otherwise, assume transport.send handles broadcasting or appropriate routing.
        if (senderId && isTargetedTransport(this.transport)) {
            // Use the type-safe sendTo method
            this.logger.debug('MCPServer: Sending response to specific sender.', { response, senderId });
            await this.transport.sendTo(senderId, JSON.stringify(response));
        } else {
            this.logger.debug('MCPServer: Sending/broadcasting response via transport.', { response });
            await this.transport.send(JSON.stringify(response));
        }

      } else {
        this.logger.warn('MCPServer: Received non-request message type, ignoring.', { message });
      }
    } catch (error) {
      this.logger.error('MCPServer: Error processing raw message.', { error, rawMessage });
      // Consider sending a generic error response if the request ID can be parsed and it was a request.
      // This part is tricky if the message itself is malformed.
      // For now, just logging. If `message` was parsed and `requestId` is available:
      // const parsedMessage = JSON.parse(rawMessage.toString()) as MCPMessage;
      // if (parsedMessage && parsedMessage.type === 'request' && parsedMessage.messageId) {
      //   const errorResponse: MCPResponse = { ... };
      //   await this.transport.send(JSON.stringify(errorResponse));
      // }
    }
  }

  public registerAction(action: string, handler: MCPRequestHandler): void {
    if (this.requestHandlers.has(action)) {
      this.logger.warn(`MCPServer: Overwriting handler for action: ${action}`);
    }
    this.requestHandlers.set(action, handler);
    this.logger.info(`MCPServer: Registered MCP action handler for: ${action}`);
  }

  // Optional: Method to unregister an action
  public unregisterAction(action: string): void {
    if (this.requestHandlers.delete(action)) {
      this.logger.info(`MCPServer: Unregistered MCP action handler for: ${action}`);
    } else {
      this.logger.warn(`MCPServer: No action handler found to unregister for: ${action}`);
    }
  }
}

// Type guard function to check if the transport has the sendTo capability
function isTargetedTransport(transport: ITransport): transport is ITransport & { sendTo(id: string, msg: string): Promise<void> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (transport as any).sendTo === 'function';
}
