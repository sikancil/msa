import { WebSocketPlugin, WebSocketPluginConfig } from '../src';
import { Logger } from '@arifwidianto/msa-core';
import { WebSocketServer, WebSocket } from 'ws';

// Mock Logger from @arifwidianto/msa-core
jest.mock('@arifwidianto/msa-core', () => {
  const originalModule = jest.requireActual('@arifwidianto/msa-core');
  return {
    ...originalModule,
    Logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

// Mock 'ws' module
const mockWebSocket = {
  on: jest.fn(),
  close: jest.fn(),
  send: jest.fn(),
  readyState: WebSocket.OPEN, // Simulate open state
};
const mockWebSocketServer = {
  on: jest.fn(),
  close: jest.fn(),
  clients: new Set(),
};
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => mockWebSocketServer),
  WebSocket: jest.fn(() => mockWebSocket), // If WebSocket class itself is instantiated
}));


describe('WebSocketPlugin', () => {
  let plugin: WebSocketPlugin;
  const defaultConfig: WebSocketPluginConfig = { port: 3001, host: 'localhost', path: '/ws' };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset clients set for each test
    mockWebSocketServer.clients.clear();
    // Reset WebSocketServer mock to return a fresh mock server instance for each test
    (WebSocketServer as jest.Mock).mockImplementation(() => {
        // Clear previous .on listeners from the shared mockWebSocketServer object
        // This is important if the same mock object is reused across tests.
        // However, since jest.clearAllMocks() is called, this might be redundant
        // if the mock implementation itself doesn't retain state across calls.
        // For safety, let's ensure 'on' is clean or use a new object.
        mockWebSocketServer.on.mockReset(); 
        mockWebSocketServer.close.mockReset();
        return mockWebSocketServer;
    });

    plugin = new WebSocketPlugin();
  });

  describe('Initialization', () => {
    it('should initialize with default config if none provided', async () => {
      await plugin.initialize({}); // Plugin has internal default { port: 3001 }
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('initialized with config: {"port":3001}'));
    });

    it('should initialize with provided config', async () => {
      await plugin.initialize(defaultConfig);
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(defaultConfig)));
    });
    
    it('should throw error if port is not configured (e.g. explicitly set to 0 or undefined)', async () => {
        await expect(plugin.initialize({ port: 0 } as any)).rejects.toThrow('WebSocket Plugin: Port must be configured.');
    });
  });

  describe('Start/Stop', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig);
    });

    it('should start the WebSocket server', async () => {
      // Simulate 'listening' event being emitted
      (WebSocketServer as jest.Mock).mockImplementationOnce(() => {
        // Simulate 'listening' event
        process.nextTick(() => {
          const listeningCallback = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'listening')?.[1];
          if (listeningCallback) listeningCallback();
        });
        return mockWebSocketServer;
      });

      await plugin.start();
      expect(WebSocketServer).toHaveBeenCalledWith({
        port: defaultConfig.port,
        host: defaultConfig.host,
        path: defaultConfig.path,
      });
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`Listening on ws://${defaultConfig.host}:${defaultConfig.port}${defaultConfig.path}`));
    });
    
    it('should handle server error on start', async () => {
        const error = new Error('Server start failed');
        (WebSocketServer as jest.Mock).mockImplementationOnce(() => {
            process.nextTick(() => {
                 const errorCallback = mockWebSocketServer.on.mock.calls.find(call => call[0] === 'error')?.[1];
                 if(errorCallback) errorCallback(error);
            });
            return mockWebSocketServer;
        });
        await expect(plugin.start()).rejects.toThrow(error.message);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`failed to start or encountered a server error: ${error.message}`));
    });

    it('should stop the WebSocket server and close clients', async () => {
      // Simulate a client being connected
      const clientMock = { ...mockWebSocket, readyState: WebSocket.OPEN, close: jest.fn() };
      mockWebSocketServer.clients.add(clientMock as any);

      await plugin.start(); // Start first
      (mockWebSocketServer.close as jest.Mock).mockImplementationOnce((callback) => callback()); // Simulate server closing

      await plugin.stop();
      expect(clientMock.close).toHaveBeenCalledWith(1000, 'Server shutting down');
      expect(mockWebSocketServer.close).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('stopped.'));
      expect(mockWebSocketServer.clients.size).toBe(0);
    });
    
    it('should resolve if stop is called when server is not running', async () => {
        await plugin.stop();
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('was not running.'));
        expect(mockWebSocketServer.close).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    let connectionCallback: ((ws: any) => void) | undefined;
    let clientMessageCallback: ((data: string) => void) | undefined;

    beforeEach(async () => {
      await plugin.initialize(defaultConfig);
      // Capture the 'connection' event handler
      (WebSocketServer as jest.Mock).mockImplementationOnce(() => {
        mockWebSocketServer.on = jest.fn((event, cb) => {
          if (event === 'connection') {
            connectionCallback = cb;
          }
        });
        return mockWebSocketServer;
      });
      await plugin.start(); // This will set up the WSS and its event handlers
    });

    it('should register a message handler via onMessage', () => {
      const handler = jest.fn();
      plugin.onMessage(handler);
      // @ts-ignore
      expect(plugin['messageHandler']).toBe(handler);
      expect(Logger.info).toHaveBeenCalledWith('WebSocket Plugin: Message handler registered via ITransport.onMessage().');
    });

    it('should handle incoming client messages if handler is registered', () => {
      const messageHandler = jest.fn();
      plugin.onMessage(messageHandler);

      // Simulate a client connecting
      const clientWsMock = { 
        on: jest.fn((event, cb) => {
          if (event === 'message') clientMessageCallback = cb;
        }),
        send: jest.fn(),
        close: jest.fn(),
        readyState: WebSocket.OPEN,
      };
      if (connectionCallback) {
        connectionCallback(clientWsMock); // Simulate connection
      } else {
        throw new Error("Connection callback not captured");
      }
      
      // Simulate client sending a message
      const testMessage = 'hello server';
      if (clientMessageCallback) {
        clientMessageCallback(testMessage);
      } else {
        throw new Error("Client message callback not captured");
      }
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
      expect(Logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Received message: ${testMessage}`));
    });
  });

  describe('Send Method', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig);
      await plugin.start();
    });

    it('should broadcast message to all open clients', async () => {
      const client1Mock = { ...mockWebSocket, readyState: WebSocket.OPEN, send: jest.fn() };
      const client2Mock = { ...mockWebSocket, readyState: WebSocket.OPEN, send: jest.fn() };
      const client3Mock = { ...mockWebSocket, readyState: WebSocket.CLOSED, send: jest.fn() }; // Closed client

      mockWebSocketServer.clients.add(client1Mock as any);
      mockWebSocketServer.clients.add(client2Mock as any);
      mockWebSocketServer.clients.add(client3Mock as any);

      const message = 'broadcast test';
      await plugin.send(message);

      expect(client1Mock.send).toHaveBeenCalledWith(message);
      expect(client2Mock.send).toHaveBeenCalledWith(message);
      expect(client3Mock.send).not.toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Message broadcasted to 2 clients.'));
    });

    it('should log if no clients are connected when sending', async () => {
        const message = 'no one to send to';
        await plugin.send(message);
        expect(Logger.info).toHaveBeenCalledWith('WebSocket Plugin: No clients connected. Message not sent.');
    });
    
    it('should reject if send is called when server not started', async () => {
        const newPlugin = new WebSocketPlugin(); // Not started
        await newPlugin.initialize(defaultConfig);
        await expect(newPlugin.send("test")).rejects.toThrow('WebSocket server not running.');
    });
  });
  
  describe('ITransport methods consistency', () => {
    it('listen() should configure port', async () => {
        await plugin.listen(8999);
        // @ts-ignore
        expect(plugin['config'].port).toBe(8999);
        await plugin.listen("9000");
        // @ts-ignore
        expect(plugin['config'].port).toBe(9000);
        await plugin.listen("invalid_port_string");
        // @ts-ignore
        expect(plugin['config'].port).toBe(9000); // Should remain last valid
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid port for listen: invalid_port_string"));
    });

    it('close() should call stop', async () => {
        const stopSpy = jest.spyOn(plugin, 'stop');
        await plugin.close();
        expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should log cleanup message', async () => {
        await plugin.cleanup();
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('cleaned up.'));
    });
  });
});
