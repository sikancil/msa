import { HttpPlugin, HttpPluginConfig } from '../src';
import { Logger } from '@arifwidianto/msa-core'; // Assuming this path is correct
import http from 'http';

// Mock Logger
jest.mock('@arifwidianto/msa-core', () => {
  const originalModule = jest.requireActual('@arifwidianto/msa-core');
  return {
    ...originalModule, // Spread original module exports
    Logger: { // Mock Logger specifically
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});


// Mock express and http.Server
const mockExpressApp = {
  use: jest.fn(),
  listen: jest.fn(),
  get: jest.fn(), // For registerRoute
  post: jest.fn(),
  // Add other HTTP methods if your registerRoute supports them
};
const mockHttpServer = {
  listen: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
  address: jest.fn().mockReturnValue({ port: 3000, address: '127.0.0.1' }),
};

jest.mock('express', () => jest.fn(() => mockExpressApp));
jest.spyOn(http, 'createServer').mockImplementation(() => mockHttpServer as any); // If HttpPlugin uses http.createServer(app)
// If HttpPlugin directly uses app.listen which returns its own server:
// Need to ensure app.listen returns our mockHttpServer
(mockExpressApp.listen as jest.Mock).mockImplementation((port, host, callback) => {
  callback(); // Simulate immediate listen
  return mockHttpServer;
});


describe('HttpPlugin', () => {
  let plugin: HttpPlugin;
  const defaultConfig: HttpPluginConfig = { port: 3000, host: 'localhost' };

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new HttpPlugin();
  });

  describe('Initialization', () => {
    it('should initialize with default config if none provided', async () => {
      // Note: HttpPlugin's internal default is { port: 3000 }, not defaultConfig from test
      await plugin.initialize({}, new Map()); 
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('initialized with config: {"port":3000}'));
      expect(require('express')).toHaveBeenCalled();
      expect(mockExpressApp.use).toHaveBeenCalledWith(expect.any(Function)); // For express.json()
      expect(mockExpressApp.use).toHaveBeenCalledWith(expect.any(Function)); // For logging middleware
    });

    it('should initialize with provided config', async () => {
      const config: HttpPluginConfig = { port: 8080, host: '0.0.0.0' };
      await plugin.initialize(config, new Map());
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(config)));
    });

    it('should throw error if port is not configured (e.g. explicitly set to 0 or undefined)', async () => {
        // This test depends on how the plugin handles a "missing" port.
        // If port can be undefined in PluginConfig and HttpPluginConfig makes it mandatory
        // then the type system should help. If it can be 0 or falsy:
        await expect(plugin.initialize({ port: 0 } as any, new Map())).rejects.toThrow('HTTP Plugin: Port must be configured.');
    });
  });

  describe('Start/Stop', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('should start the HTTP server', async () => {
      await plugin.start();
      expect(mockExpressApp.listen).toHaveBeenCalledWith(
        defaultConfig.port,
        defaultConfig.host,
        expect.any(Function)
      );
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`Listening on ${defaultConfig.host}:${defaultConfig.port}`));
    });

    it('should throw error if start is called before initialize', async () => {
      const newPlugin = new HttpPlugin(); // Uninitialized plugin
      await expect(newPlugin.start()).rejects.toThrow('HTTP Plugin: Not initialized. Call initialize() first.');
    });

    it('should stop the HTTP server', async () => {
      await plugin.start(); // Start first
      (mockHttpServer.close as jest.Mock).mockImplementationOnce((callback) => callback()); // Simulate server closing
      await plugin.stop();
      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('stopped.'));
    });
    
    it('should resolve if stop is called when server is not running', async () => {
        await plugin.stop(); // Server not started or already stopped
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('was not running.'));
        expect(mockHttpServer.close).not.toHaveBeenCalled();
    });

    it('should handle server error on start', async () => {
        const error = new Error('Listen EADDRINUSE');
        (mockExpressApp.listen as jest.Mock).mockImplementationOnce((p, h, c) => {
            // Simulate error event being emitted by the server object returned by app.listen
            // This requires that app.listen indeed returns an object on which 'error' can be emitted
            // And that object is our mockHttpServer
            process.nextTick(() => mockHttpServer.on.mock.calls.find(c => c[0] === 'error')[1](error));
            return mockHttpServer;
        });
        await expect(plugin.start()).rejects.toThrow(error.message);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`failed to start: ${error.message}`));
    });
  });

  describe('Route Registration', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('should register a GET route', () => {
      const handler = jest.fn();
      plugin.registerRoute('get', '/test', handler);
      expect(mockExpressApp.get).toHaveBeenCalledWith('/test', handler);
      expect(Logger.info).toHaveBeenCalledWith('HTTP Plugin: Route registered: GET /test');
    });

    it('should register a POST route', () => {
      const handler = jest.fn();
      plugin.registerRoute('post', '/submit', handler);
      expect(mockExpressApp.post).toHaveBeenCalledWith('/submit', handler);
      expect(Logger.info).toHaveBeenCalledWith('HTTP Plugin: Route registered: POST /submit');
    });

    it('should throw error if registering route before initialization', () => {
      const newPlugin = new HttpPlugin();
      const handler = jest.fn();
      expect(() => newPlugin.registerRoute('get', '/test', handler)).toThrow('HTTP Plugin: Not initialized. Cannot register route.');
    });
    
    it('should throw error for invalid HTTP method', () => {
        const handler = jest.fn();
        expect(() => plugin.registerRoute('invalid', '/test', handler)).toThrow('HTTP Plugin: Invalid HTTP method "invalid".');
    });
  });

  describe('ITransport methods', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('listen() should update config port and log', async () => {
        await plugin.listen(8888);
        // @ts-ignore access private member for test
        expect(plugin['config'].port).toBe(8888);
        await plugin.listen("9999");
        // @ts-ignore
        expect(plugin['config'].port).toBe(9999);
        await plugin.listen("invalid_port"); // Should warn and keep existing port
        // @ts-ignore
        expect(plugin['config'].port).toBe(9999); // Stays 9999
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining("Invalid port/path for listen: invalid_port"));
    });

    it('send() should log a warning as it is not implemented for server', async () => {
        await plugin.send({ data: "test" });
        expect(Logger.warn).toHaveBeenCalledWith('HTTP Plugin: ITransport.send() is not meaningfully implemented for a server-focused HTTP plugin.');
    });

    it('onMessage() should register a generic handler and log', () => {
        const handler = jest.fn();
        plugin.onMessage(handler);
        // @ts-ignore
        expect(plugin['messageHandler']).toBe(handler);
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining("Generic message handler registered"));
    });
    
    it('close() should call stop', async () => {
        const stopSpy = jest.spyOn(plugin, 'stop');
        await plugin.close();
        expect(stopSpy).toHaveBeenCalled();
    });
  });
  
  describe('Cleanup', () => {
    it('should nullify the app instance', async () => {
        await plugin.initialize(defaultConfig, new Map());
        expect(plugin.getExpressApp()).not.toBeNull();
        await plugin.cleanup();
        expect(plugin.getExpressApp()).toBeNull();
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('cleaned up.'));
    });
  });
});
