import { Service } from '../src/Service';
import { IPlugin, PluginConfig, Logger } from '../src'; // Assuming index.ts exports Logger

// Mock Logger to prevent actual logging and allow spying
jest.mock('../src/Logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock IPlugin
const mockPlugin = (name: string, dependencies: string[] = []): IPlugin => ({
  name,
  version: '1.0.0',
  dependencies,
  initialize: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  cleanup: jest.fn().mockResolvedValue(undefined),
});

describe('Service', () => {
  let service: Service;
  let plugin1: IPlugin;
  let plugin2: IPlugin;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    service = new Service();
    plugin1 = mockPlugin('plugin1');
    plugin2 = mockPlugin('plugin2', ['plugin1']);
  });

  describe('Plugin Registration', () => {
    it('should register a plugin', () => {
      service.registerPlugin(plugin1);
      // @ts-ignore access private member for test
      expect(service['plugins']).toContain(plugin1);
      expect(Logger.info).toHaveBeenCalledWith(`Plugin "plugin1" registered.`);
    });

    it('should log a warning if a dependency is not yet registered', () => {
      service.registerPlugin(plugin2); // plugin1 (dependency) is not registered yet
      expect(Logger.warn).toHaveBeenCalledWith(
        'Plugin "plugin2" depends on "plugin1", which is not registered or registered after this plugin.'
      );
      // @ts-ignore
      expect(service['plugins']).toContain(plugin2); // Still registers
    });

    it('should not log a warning if dependency is already registered', () => {
      service.registerPlugin(plugin1);
      service.registerPlugin(plugin2); // plugin1 is now registered
      expect(Logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('depends on "plugin1"')
      );
    });
  });

  describe('Service Lifecycle', () => {
    const configs: Record<string, PluginConfig> = {
      plugin1: { setting: 'value1' },
      plugin2: { setting: 'value2' },
    };

    beforeEach(() => {
      service.registerPlugin(plugin1);
      service.registerPlugin(plugin2);
    });

    it('should initialize all registered plugins with their configs', async () => {
      await service.initializeService(configs);
      expect(plugin1.initialize).toHaveBeenCalledWith(configs.plugin1, expect.any(Map));
      expect(plugin2.initialize).toHaveBeenCalledWith(configs.plugin2, expect.any(Map));
      expect(Logger.info).toHaveBeenCalledWith('Initializing service...');
      expect(Logger.info).toHaveBeenCalledWith('Initializing plugin "plugin1"...');
      expect(Logger.info).toHaveBeenCalledWith('Plugin "plugin1" initialized.');
      expect(Logger.info).toHaveBeenCalledWith('Service initialized.');
    });

    it('should initialize plugin with empty config if not provided', async () => {
      await service.initializeService({});
      expect(plugin1.initialize).toHaveBeenCalledWith({}, expect.any(Map));
    });
    
    it('should handle errors during plugin initialization', async () => {
      const error = new Error('Init failed');
      (plugin1.initialize as jest.Mock).mockRejectedValueOnce(error);
      await service.initializeService(configs);
      expect(Logger.error).toHaveBeenCalledWith(`Error initializing plugin "plugin1": ${error.message}`);
      expect(plugin2.initialize).toHaveBeenCalled(); // Should continue with other plugins
    });

    it('should start all registered plugins', async () => {
      await service.startService();
      expect(plugin1.start).toHaveBeenCalled();
      expect(plugin2.start).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith('Starting service...');
      expect(Logger.info).toHaveBeenCalledWith('Starting plugin "plugin1"...');
      expect(Logger.info).toHaveBeenCalledWith('Plugin "plugin1" started.');
      expect(Logger.info).toHaveBeenCalledWith('Service started.');
    });

    it('should handle errors during plugin start', async () => {
        const error = new Error('Start failed');
        (plugin1.start as jest.Mock).mockRejectedValueOnce(error);
        await service.startService();
        expect(Logger.error).toHaveBeenCalledWith(`Error starting plugin "plugin1": ${error.message}`);
        expect(plugin2.start).toHaveBeenCalled(); // Should continue
    });

    it('should stop all registered plugins in reverse order', async () => {
      await service.stopService();
      expect(plugin2.stop).toHaveBeenCalled();
      expect(plugin1.stop).toHaveBeenCalled();
      // Check call order if Jest supports it easily or by tracking calls
      const stopOrder = (Logger.info as jest.Mock).mock.calls.filter(
        (call: any) => call[0].includes('Stopping plugin')
      );
      expect(stopOrder[0][0]).toBe('Stopping plugin "plugin2"...');
      expect(stopOrder[1][0]).toBe('Stopping plugin "plugin1"...');
      expect(Logger.info).toHaveBeenCalledWith('Service stopped.');
    });

    it('should handle errors during plugin stop', async () => {
        const error = new Error('Stop failed');
        (plugin2.stop as jest.Mock).mockRejectedValueOnce(error);
        await service.stopService();
        expect(Logger.error).toHaveBeenCalledWith(`Error stopping plugin "plugin2": ${error.message}`);
        expect(plugin1.stop).toHaveBeenCalled(); // Should continue
    });

    it('should cleanup all registered plugins in reverse order', async () => {
      await service.cleanupService();
      expect(plugin2.cleanup).toHaveBeenCalled();
      expect(plugin1.cleanup).toHaveBeenCalled();
      const cleanupOrder = (Logger.info as jest.Mock).mock.calls.filter(
        (call: any) => call[0].includes('Cleaning up plugin')
      );
      expect(cleanupOrder[0][0]).toBe('Cleaning up plugin "plugin2"...');
      expect(cleanupOrder[1][0]).toBe('Cleaning up plugin "plugin1"...');
      expect(Logger.info).toHaveBeenCalledWith('Service cleaned up.');
      // @ts-ignore
      expect(service['plugins']).toEqual([]); // Plugins should be cleared
    });

    it('should handle errors during plugin cleanup', async () => {
        const error = new Error('Cleanup failed');
        (plugin2.cleanup as jest.Mock).mockRejectedValueOnce(error);
        await service.cleanupService();
        expect(Logger.error).toHaveBeenCalledWith(`Error cleaning up plugin "plugin2": ${error.message}`);
        expect(plugin1.cleanup).toHaveBeenCalled(); // Should continue
    });
  });

  describe('Graceful Shutdown', () => {
    let mockProcessOn: jest.SpyInstance;
    let mockProcessExit: jest.SpyInstance;

    beforeEach(() => {
        // Spy on process.on and process.exit
        mockProcessOn = jest.spyOn(process, 'on');
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any); // Mock exit to prevent test runner from exiting
        
        // Re-create service to register new signal handlers with spies
        service = new Service(); 
        service.registerPlugin(plugin1);
    });

    afterEach(() => {
        // Restore original process functions
        mockProcessOn.mockRestore();
        mockProcessExit.mockRestore();
    });

    it('should setup signal handlers for SIGINT and SIGTERM', () => {
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should call stopService and cleanupService on SIGINT', async () => {
      // Find the SIGINT handler
      const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')[1];
      
      // jest.spyOn(service, 'stopService'); // Does not work as service instance is different in handler
      // jest.spyOn(service, 'cleanupService');

      await sigintHandler(); // Call the handler

      expect(Logger.info).toHaveBeenCalledWith('Received SIGINT. Starting graceful shutdown...');
      // To test that stopService and cleanupService are called on the *correct instance* of service
      // is tricky here because the instance used in the test is not the same as the one
      // the handler closes over unless we expose the service instance or use other patterns.
      // For now, we check if Logger recorded the events, implying methods were called.
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopping service...'));
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaning up service...'));
      expect(Logger.info).toHaveBeenCalledWith('Graceful shutdown completed. Exiting.');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
    
    it('should only allow one shutdown process at a time', async () => {
        const sigtermHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGTERM')[1];
        
        // Call once
        const firstShutdown = sigtermHandler();
        // Call again immediately
        await sigtermHandler();

        await firstShutdown; // Wait for the first one to complete its async operations

        expect(Logger.info).toHaveBeenCalledWith('Received SIGTERM. Starting graceful shutdown...');
        expect(Logger.info).toHaveBeenCalledWith('Shutdown already in progress. Received SIGTERM again.');
        // Ensure shutdown sequence (stop, cleanup, exit) is logged/called only once effectively
        expect((Logger.info as jest.Mock).mock.calls.filter(c => c[0] === 'Graceful shutdown completed. Exiting.').length).toBe(1);
        expect(mockProcessExit).toHaveBeenCalledTimes(1);
    });
  });
});
