import { MCPServer, MCPRequestHandler } from '../src/MCPServer';
import { MCPRequest, MCPResponse, MCPContext, MCPMessage } from '../src/mcp-types';
import { ITransport, Logger } from '@arifwidianto/msa-core';

// Mock Logger from @arifwidianto/msa-core
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const MockLogger = mockLoggerInstance as unknown as Logger; // Cast to Logger type for MCPServer constructor

// Mock ITransport
const mockTransportInstance: ITransport = {
  listen: jest.fn(),
  send: jest.fn(),
  onMessage: jest.fn(),
  close: jest.fn(),
  // Add sendTo if your ITransport or MCPServer logic specifically uses it
  // sendTo: jest.fn(), // Example if MCPServer uses a sendTo method
};

describe('MCPServer', () => {
  let server: MCPServer;
  let transportOnMessageCallback: ((message: any, senderId?: string) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    // Capture the onMessage callback when MCPServer is instantiated
    (mockTransportInstance.onMessage as jest.Mock).mockImplementation((callback) => {
      transportOnMessageCallback = callback;
    });
    server = new MCPServer(mockTransportInstance, MockLogger);
  });

  it('should initialize and set onMessage handler for transport', () => {
    expect(mockTransportInstance.onMessage).toHaveBeenCalledWith(expect.any(Function));
    expect(MockLogger.info).toHaveBeenCalledWith('MCPServer initialized. Listening for messages on the provided transport.');
  });

  describe('Action Registration', () => {
    it('should register an action handler', () => {
      const handler: MCPRequestHandler = jest.fn().mockResolvedValue({ payload: 'test' });
      server.registerAction('testAction', handler);
      expect(MockLogger.info).toHaveBeenCalledWith('MCPServer: Registered MCP action handler for: testAction');
      // @ts-ignore - Access private member for test
      expect(server['requestHandlers'].has('testAction')).toBe(true);
    });

    it('should warn when overwriting an existing action handler', () => {
      const handler1: MCPRequestHandler = jest.fn();
      const handler2: MCPRequestHandler = jest.fn();
      server.registerAction('testAction', handler1);
      server.registerAction('testAction', handler2);
      expect(MockLogger.warn).toHaveBeenCalledWith('MCPServer: Overwriting handler for action: testAction');
    });
    
    it('should unregister an action handler', () => {
        const handler: MCPRequestHandler = jest.fn();
        server.registerAction('testAction', handler);
        server.unregisterAction('testAction');
        expect(MockLogger.info).toHaveBeenCalledWith('MCPServer: Unregistered MCP action handler for: testAction');
        // @ts-ignore
        expect(server['requestHandlers'].has('testAction')).toBe(false);
    });
  });

  describe('Message Handling and Response', () => {
    const testAction = 'doSomething';
    let mockActionHandler: jest.Mock<Promise<Partial<MCPResponse>>, [MCPRequest, MCPContext]>;

    const sampleRequest: MCPRequest = {
      messageId: 'req123',
      protocolVersion: '1.0',
      timestamp: new Date().toISOString(),
      type: 'request',
      action: testAction,
      payload: { data: 'sample' },
      context: { sessionId: 'sess456' },
    };

    beforeEach(() => {
      mockActionHandler = jest.fn();
      server.registerAction(testAction, mockActionHandler);
    });

    it('should call the correct handler for a registered action and send a success response', async () => {
      const handlerResponsePayload = { result: 'action completed' };
      mockActionHandler.mockResolvedValue({ payload: handlerResponsePayload, status: 'success' });

      expect(transportOnMessageCallback).toBeDefined();
      await transportOnMessageCallback!(JSON.stringify(sampleRequest), 'client1');

      expect(mockActionHandler).toHaveBeenCalledWith(sampleRequest, sampleRequest.context);
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('"status":"success"'));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(handlerResponsePayload)));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining(`"requestId":"${sampleRequest.messageId}"`));
      expect(MockLogger.info).toHaveBeenCalledWith({ requestId: sampleRequest.messageId, action: sampleRequest.action, senderId: 'client1' }, 'MCPServer: MCP Request received');
    });

    it('should send an error response if no handler is found for an action', async () => {
      const unknownActionRequest: MCPRequest = { ...sampleRequest, action: 'unknownAction' };
      await transportOnMessageCallback!(JSON.stringify(unknownActionRequest));

      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('"code":"NO_HANDLER"'));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('No handler registered for action: unknownAction'));
      expect(MockLogger.warn).toHaveBeenCalledWith({ requestId: unknownActionRequest.messageId, action: unknownActionRequest.action }, 'MCPServer: No handler found for action');
    });

    it('should send an error response if the handler throws an exception', async () => {
      const errorMessage = 'Handler failed!';
      mockActionHandler.mockRejectedValue(new Error(errorMessage));

      await transportOnMessageCallback!(JSON.stringify(sampleRequest));

      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining('"code":"HANDLER_EXCEPTION"'));
      expect(mockTransportInstance.send).toHaveBeenCalledWith(expect.stringContaining(errorMessage));
      expect(MockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ requestId: sampleRequest.messageId, action: sampleRequest.action }), 'MCPServer: Error in request handler');
    });

    it('should ignore non-request message types', async () => {
      const nonRequestMessage = { type: 'event', data: 'something happened' };
      await transportOnMessageCallback!(JSON.stringify(nonRequestMessage));

      expect(mockTransportInstance.send).not.toHaveBeenCalled();
      expect(MockLogger.warn).toHaveBeenCalledWith({ message: nonRequestMessage }, 'MCPServer: Received non-request message type, ignoring.');
    });

    it('should handle JSON parsing errors for incoming messages', async () => {
      const invalidJsonMessage = "{ not json";
      await transportOnMessageCallback!(invalidJsonMessage);

      expect(mockTransportInstance.send).not.toHaveBeenCalled(); // Should not send if can't parse request ID etc.
      expect(MockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ rawMessage: invalidJsonMessage }), 'MCPServer: Error processing raw message.');
    });
    
    it('should use senderId with transport.sendTo if available and method exists', async () => {
        const mockSendToTransport = { ...mockTransportInstance, sendTo: jest.fn() };
        server = new MCPServer(mockSendToTransport, MockLogger); // Re-init server with new transport
        
        // Need to re-capture the onMessage callback for the new server instance
        const newTransportOnMessageCallback = (mockSendToTransport.onMessage as jest.Mock).mock.calls[0][0];

        mockActionHandler.mockResolvedValue({ payload: "data" });
        server.registerAction(testAction, mockActionHandler); // Re-register action

        await newTransportOnMessageCallback(JSON.stringify(sampleRequest), 'clientXYZ');
        
        expect(mockSendToTransport.sendTo).toHaveBeenCalledWith('clientXYZ', expect.stringContaining(`"requestId":"${sampleRequest.messageId}"`));
        expect(mockSendToTransport.send).not.toHaveBeenCalled(); // Ensure send was not called
    });
  });
});
