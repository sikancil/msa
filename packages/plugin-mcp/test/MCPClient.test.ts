import { MCPClient } from '../src/MCPClient';
import { MCPRequest, MCPResponse, MCPMessage, MCPContext } from '../src/mcp-types';
import { Logger } from '@arifwidianto/msa-core';
import WebSocket from 'ws';

// Mock Logger from @arifwidianto/msa-core
jest.mock('@arifwidianto/msa-core', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock 'ws' (WebSocket)
const mockWebSocketInstance: {
  on: jest.Mock;
  send: jest.Mock;
  close: jest.Mock;
  readyState: number;
} = {
  on: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.CLOSED, // Initial state
};
const WS_MOCK = jest.fn().mockImplementation(() => mockWebSocketInstance);
(WS_MOCK as any).CONNECTING = 0;
(WS_MOCK as any).OPEN = 1;
(WS_MOCK as any).CLOSING = 2;
(WS_MOCK as any).CLOSED = 3;
jest.mock('ws', () => WS_MOCK);
describe('MCPClient', () => {
  let client: MCPClient;
  const serverUrl = 'ws://localhost:8080/mcp';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset WebSocket instance for each test to ensure clean event handlers
    Object.assign(mockWebSocketInstance, {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.CLOSED,
    });
    client = new MCPClient(serverUrl);
  });

  describe('Connection', () => {
    it('should connect to the server and resolve promise on open', async () => {
      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'open') {
          mockWebSocketInstance.readyState = WebSocket.OPEN;
          callback(); // Simulate 'open' event
        }
      });
      await client.connect();
      expect(WebSocket).toHaveBeenCalledWith(serverUrl);
      expect(mockWebSocketInstance.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWebSocketInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocketInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWebSocketInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(Logger.info).toHaveBeenCalledWith(`MCPClient: Successfully connected to ${serverUrl}.`);
    });

    it('should reject promise on connection error', async () => {
      const error = new Error('Connection failed');
      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'error') {
          callback(error); // Simulate 'error' event
        }
      });
      await expect(client.connect()).rejects.toThrow(error);
      expect(Logger.error).toHaveBeenCalledWith(`MCPClient: WebSocket error: ${error.message}`);
    });

    it('should handle close event and reject pending requests', (done) => {
      const closeCode = 1006;
      const closeReason = 'Abnormal closure';

      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'open') {
          mockWebSocketInstance.readyState = WebSocket.OPEN;
          callback();
        } else if (event === 'close') {
          // Simulate close after a slight delay to allow a request to be "pending"
          setTimeout(() => {
            mockWebSocketInstance.readyState = WebSocket.CLOSED;
            callback(closeCode, closeReason);

            // Assertions after close event has been processed
            expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`MCPClient: WebSocket connection closed. Code: ${closeCode}, Reason: ${closeReason}`));
            done(); // Signal test completion
          }, 50);
        }
      });

      client.connect().then(() => {
        // Send a request that will become pending
        client.sendRequest('testAction', { data: 'test' }).catch(err => {
          expect(err.message).toContain('MCPClient: Connection closed. Request');
        });
      });
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      // Simulate successful connection for these tests
      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'open') {
          mockWebSocketInstance.readyState = WebSocket.OPEN;
          callback();
        }
      });
      await client.connect();
    });

    it('should process incoming response and resolve pending request', (done) => {
      const requestId = 'req123';
      const responsePayload = { result: 'success' };
      const response: MCPResponse = {
        messageId: 'res456',
        protocolVersion: '1.0',
        timestamp: new Date().toISOString(),
        type: 'response',
        requestId,
        status: 'success',
        payload: responsePayload,
      };

      // Manually add to pendingRequests for test, as sendRequest is complex to fully mock here
      // @ts-ignore - Accessing private member for test
      client['pendingRequests'].set(requestId, {
        resolve: (res) => {
          expect(res).toEqual(response);
          done();
        },
        reject: jest.fn()
      });

      // Simulate receiving a message
      const messageHandler = (mockWebSocketInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(JSON.stringify(response));

      expect(Logger.debug).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(response)));
    });

    it('should call onMessageHandler for non-response messages or unhandled responses', () => {
      const customHandler = jest.fn();
      client.setOnMessageHandler(customHandler);

      const serverPushMessage: MCPRequest = { // Example of a server-initiated request (if protocol supports)
        messageId: 'serverPush789',
        protocolVersion: '1.0',
        timestamp: new Date().toISOString(),
        type: 'request',
        action: 'notify_update',
        payload: { info: 'System will restart' },
      };

      const messageHandler = (mockWebSocketInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(JSON.stringify(serverPushMessage));

      expect(customHandler).toHaveBeenCalledWith(serverPushMessage);
    });

    it('should handle JSON parsing errors gracefully', () => {
      const invalidJson = "{ not: json";
      const messageHandler = (mockWebSocketInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(invalidJson);
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error handling incoming message: Unexpected token`));
    });
  });

  describe('sendRequest', () => {
    beforeEach(async () => {
      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'open') {
          mockWebSocketInstance.readyState = WebSocket.OPEN;
          callback();
        }
      });
      await client.connect();
    });

    it('should send a request and store it in pendingRequests', async () => {
      const action = 'testAction';
      const payload = { data: 'test' };
      (mockWebSocketInstance.send as jest.Mock).mockImplementation((data, cb) => cb()); // Simulate successful send

      const responsePromise = client.sendRequest(action, payload);

      // Check that send was called with a valid MCPRequest
      expect(mockWebSocketInstance.send).toHaveBeenCalledWith(
        expect.stringContaining(`"type":"request","action":"${action}"`),
        expect.any(Function)
      );

      // Check that a request ID was generated and is in pendingRequests
      const sentData = JSON.parse((mockWebSocketInstance.send as jest.Mock).mock.calls[0][0]);
      // @ts-ignore
      expect(client['pendingRequests'].has(sentData.messageId)).toBe(true);

      // Simulate receiving a response for this request to resolve the promise
      const mockResponse: MCPResponse = {
        messageId: 'responseId',
        protocolVersion: '1.0',
        timestamp: new Date().toISOString(),
        type: 'response',
        requestId: sentData.messageId,
        status: 'success',
        payload: { result: 'ok' }
      };
      const messageHandler = (mockWebSocketInstance.on as jest.Mock).mock.calls.find(call => call[0] === 'message')[1];
      messageHandler(JSON.stringify(mockResponse)); // Simulate server response

      await expect(responsePromise).resolves.toEqual(mockResponse);
    });

    it('should reject if WebSocket send fails', async () => {
      const sendError = new Error('Send failed');
      (mockWebSocketInstance.send as jest.Mock).mockImplementation((data, cb) => cb(sendError));

      await expect(client.sendRequest('failAction', {})).rejects.toThrow(sendError);
    });

    it('should throw error if not connected', async () => {
      mockWebSocketInstance.readyState = WebSocket.CLOSED; // Simulate not connected
      // MCPClient's sendRequest now tries to connect, so we need to ensure that connect also fails for this test.
      (WebSocket as unknown as jest.Mock).mockImplementationOnce(() => {
        const ws = { ...mockWebSocketInstance, readyState: WebSocket.CONNECTING };
        setTimeout(() => ws.on.mock.calls.find(c => c[0] === 'error')[1](new Error("Forced connect fail")), 50);
        return ws;
      });
      await expect(client.sendRequest('action', {})).rejects.toThrow('MCPClient: Connection failed. Cannot send request.');
    });

    it('should handle request timeout', async () => {
      jest.useFakeTimers();
      const action = 'timeoutAction';
      (mockWebSocketInstance.send as jest.Mock).mockImplementation((data, cb) => cb());

      const responsePromise = client.sendRequest(action, {});

      // Fast-forward time until 30s timeout occurs
      jest.advanceTimersByTime(30000);

      await expect(responsePromise).rejects.toThrow(expect.stringContaining('timed out'));
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Request ${expect.any(String)} (action: ${action}) timed out.`));
      jest.useRealTimers();
    });
  });

  describe('Close', () => {
    it('should close the WebSocket connection', () => {
      client.close();
      expect(mockWebSocketInstance.close).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Manually closing connection'));
    });
  });

  describe('Auto-Reconnection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should attempt to reconnect on close if autoReconnect is true', async () => {
      let openCallback: any, errorCallback: any, closeCallback: any;
      (mockWebSocketInstance.on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'open') openCallback = callback;
        if (event === 'error') errorCallback = callback;
        if (event === 'close') closeCallback = callback;
      });

      // Initial connection
      const connectPromise = client.connect();
      if (openCallback) openCallback(); // Simulate open
      await connectPromise;

      // Simulate unexpected close
      if (closeCallback) closeCallback(1006, 'Network lost');

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Attempting to reconnect'));

      // Fast-forward to trigger reconnect attempt
      jest.advanceTimersByTime(5000); // Default reconnectInterval

      // Expect WebSocket to be called again for reconnection
      // The first call was for the initial connect, so this should be the second call.
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });

    it('should stop reconnecting after maxReconnectAttempts', async () => {
      client = new MCPClient(serverUrl, true, 2, 1000); // Max 2 attempts, 1s interval
      let openCallback: any, errorCallback: any, closeCallback: any;

      (WebSocket as unknown as jest.Mock).mockImplementation(() => {
        // Ensure each new WebSocket mock instance gets its own event setup
        const newWsMock = { ...mockWebSocketInstance, on: jest.fn(), close: jest.fn(), readyState: WebSocket.CONNECTING };
        (newWsMock.on as jest.Mock).mockImplementation((event, callback) => {
          if (event === 'open') openCallback = callback;
          if (event === 'error') errorCallback = callback; // For connect failures
          if (event === 'close') closeCallback = callback;
        });
        // Simulate connection failure for reconnect attempts
        setTimeout(() => {
          if (errorCallback) errorCallback(new Error("Simulated connect error"));
          if (closeCallback) closeCallback(1006); // Also trigger close
        }, 50);
        return newWsMock;
      });

      // Initial connection attempt (which will fail as per mock above)
      client.connect().catch(() => { }); // Catch initial error

      // Simulate first failure and trigger close
      jest.advanceTimersByTime(100);

      // Reconnect attempt 1
      jest.advanceTimersByTime(1000); // Interval
      jest.advanceTimersByTime(100);  // Simulate failure of attempt 1

      // Reconnect attempt 2
      jest.advanceTimersByTime(1000); // Interval
      jest.advanceTimersByTime(100);  // Simulate failure of attempt 2

      // Should log max attempts reached
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Max reconnect attempts (2) reached.'));

      // Should not try to connect a 4th time (initial + 2 retries)
      jest.advanceTimersByTime(1000); // Pass another interval
      expect(WebSocket).toHaveBeenCalledTimes(3); // Initial (1) + Reconnect Attempt 1 (2) + Reconnect Attempt 2 (3)
    });
    jest.useRealTimers();
  });
});
