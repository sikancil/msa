import { HttpPlugin, HttpMessagePayload } from '../HttpPlugin';
import { PluginConfig, Logger, MessageHandler, IPlugin, Message } from '@arifwidianto/msa-core';
import request from 'supertest';

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

describe('HttpPlugin', () => {
  let plugin: HttpPlugin;
  let mockCoreLogger: typeof Logger;
  const emptyDependenciesMap = new Map<string, IPlugin>();

  beforeEach(() => {
    plugin = new HttpPlugin();
    mockCoreLogger = require('@arifwidianto/msa-core').Logger;
    jest.clearAllMocks();
  });

  const defaultConfig: PluginConfig & { port?: number } = { port: 0 };

  describe('Plugin Lifecycle & Basic Setup', () => {
    it('should have correct name and version', () => {
      expect(plugin.name).toBe('msa-plugin-http');
      expect(plugin.version).toBe('0.1.0');
    });

    it('should initialize with default port if no port in config', async () => {
      await plugin.initialize({}, emptyDependenciesMap);
      expect(plugin.getExpressApp()).toBeDefined();
      // @ts-ignore - access private config for test
      expect(plugin.config.port).toBe(3000);
    });
    
    it('should initialize with provided config', async () => {
      const config = { port: 8080, host: '0.0.0.0' };
      await plugin.initialize(config, emptyDependenciesMap);
      expect(plugin.getExpressApp()).toBeDefined();
      // @ts-ignore 
      expect(plugin.config.port).toBe(8080);
      // @ts-ignore
      expect(plugin.config.host).toBe('0.0.0.0');
      expect(mockCoreLogger.info).toHaveBeenCalledWith(expect.stringContaining('HTTP Plugin "msa-plugin-http" initialized with config:'));
    });

    it('should throw error if initialize is called without any port configured (after manually clearing default)', async () => {
        // @ts-ignore 
        plugin.config = {}; 
        await expect(plugin.initialize({}, emptyDependenciesMap))
              .rejects.toThrow('HTTP Plugin: Port must be configured.');
    });

    it('should start and stop the server via listen and close', async () => {
      await plugin.initialize(defaultConfig, emptyDependenciesMap);
      await plugin.listen(0); 
      const expressApp = plugin.getExpressApp();
      expect(expressApp).toBeDefined();
      // @ts-ignore 
      expect(plugin.server).toBeDefined();
      // @ts-ignore 
      expect(plugin.server.listening).toBe(true);
      
      await plugin.close();
      // @ts-ignore 
      expect(plugin.server).toBeNull();
    });
    
    it('IPlugin.start should call listen', async () => {
      await plugin.initialize(defaultConfig, emptyDependenciesMap);
      const listenSpy = jest.spyOn(plugin, 'listen');
      await plugin.start();
      expect(listenSpy).toHaveBeenCalled();
      await plugin.close();
    });

    it('IPlugin.stop should call close', async () => {
      await plugin.initialize(defaultConfig, emptyDependenciesMap);
      await plugin.listen(0);
      const closeSpy = jest.spyOn(plugin, 'close');
      await plugin.stop();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should cleanup resources', async () => {
      await plugin.initialize(defaultConfig, emptyDependenciesMap);
      await plugin.cleanup();
      expect(plugin.getExpressApp()).toBeNull();
    });
  });

  describe('ITransport Interface', () => {
    beforeEach(async () => {
      await plugin.initialize({ port: 0 }, emptyDependenciesMap);
    });
    
    afterEach(async () => {
      await plugin.close();
    });

    it('send() should log a warning', async () => {
      await plugin.send({} as Message);
      expect(mockCoreLogger.warn).toHaveBeenCalledWith('HTTP Plugin: ITransport.send() is not meaningfully implemented for a server-focused HTTP plugin.');
    });

    it('listen() should use configured port if portOrPath is invalid string', async () => {
      const initialConfig = { port: 1234 };
      await plugin.initialize(initialConfig, emptyDependenciesMap);
      await plugin.listen("invalidPathString"); 
      // @ts-ignore 
      expect(plugin.config.port).toBe(1234);
      // @ts-ignore 
      expect(plugin.server?.listening).toBe(true);
    });

    it('listen() should throw if portOrPath is invalid and no default/current port configured', async () => {
        // @ts-ignore 
        plugin.config = {}; 
        await expect(plugin.listen("invalidPathString")).rejects.toThrow('HTTP Plugin: Invalid or no port specified for listen: "invalidPathString" and no default port configured.');
    });
  });

  describe('HTTP Specific Functionality & Routing', () => {
    beforeEach(async () => {
      await plugin.initialize({ port: 0 }, emptyDependenciesMap); 
      await plugin.listen(0); 
    });

    afterEach(async () => {
      await plugin.close();
    });

    it('getExpressApp() should return the express app', () => {
      expect(plugin.getExpressApp()).toBeDefined();
    });

    it('should register and handle a GET route', async () => {
      const mockRouteHandler = jest.fn((_req, res) => res.status(200).send('GET OK'));
      plugin.registerRoute('get', '/test-get', mockRouteHandler);
      
      const app = plugin.getExpressApp();
      if (!app) throw new Error('Express app not initialized');

      const response = await request(app).get('/test-get');
      expect(response.status).toBe(200);
      expect(response.text).toBe('GET OK');
      expect(mockRouteHandler).toHaveBeenCalledTimes(1);
    });

    it('should register and handle a POST route with JSON middleware', async () => {
      const mockRouteHandler = jest.fn((req, res) => res.status(201).json({ received: req.body }));
      plugin.registerRoute('post', '/test-post', mockRouteHandler);

      const app = plugin.getExpressApp();
      if (!app) throw new Error('Express app not initialized');

      const postData = { message: 'hello' };
      const response = await request(app).post('/test-post').send(postData);
      expect(response.status).toBe(201);
      expect(response.body.received).toEqual(postData);
      expect(mockRouteHandler).toHaveBeenCalledTimes(1);
    });

    it('generic onMessage handler should be called for unhandled routes', async () => {
      const mockMessageHandler: MessageHandler = jest.fn((msg: Message) => {
        const payload = msg as unknown as HttpMessagePayload;
        payload.response.status(202).send('Generic Handler OK');
      });
      plugin.onMessage(mockMessageHandler);
      
      const app = plugin.getExpressApp();
      if (!app) throw new Error('Express app not initialized');

      const response = await request(app).get('/unhandled-route');
      expect(response.status).toBe(202);
      expect(response.text).toBe('Generic Handler OK');
      expect(mockMessageHandler).toHaveBeenCalledTimes(1);
      
      const receivedMessage = (mockMessageHandler as jest.Mock).mock.calls[0][0] as HttpMessagePayload;
      expect(receivedMessage.request).toBeDefined();
      expect(receivedMessage.response).toBeDefined();
      expect(receivedMessage.request.path).toBe('/unhandled-route');
    });

    it('specific routes should take precedence over generic onMessage handler', async () => {
      const mockSpecificHandler = jest.fn((_req, res) => res.status(200).send('Specific Route OK'));
      plugin.registerRoute('get', '/specific-route', mockSpecificHandler);

      const mockGenericHandler: MessageHandler = jest.fn();
      plugin.onMessage(mockGenericHandler);
      
      const app = plugin.getExpressApp();
      if (!app) throw new Error('Express app not initialized');

      const response = await request(app).get('/specific-route');
      expect(response.status).toBe(200);
      expect(response.text).toBe('Specific Route OK');
      expect(mockSpecificHandler).toHaveBeenCalledTimes(1);
      expect(mockGenericHandler).not.toHaveBeenCalled();
    });

    it('should log requests using logger middleware', async () => {
      const app = plugin.getExpressApp();
      if (!app) throw new Error('Express app not initialized');

      await request(app).get('/logged-route');
      expect(mockCoreLogger.info).toHaveBeenCalledWith('HTTP Request: GET /logged-route');
    });
  });
});
