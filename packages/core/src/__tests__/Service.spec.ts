import { Service } from '../Service';
import { IPlugin, PluginConfig } from '../interfaces/IPlugin';
import { Logger } from '../Logger';

// Mock Logger to prevent actual logging during tests and allow spying
jest.mock('../Logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    getInstance: jest.fn(),
  },
}));

// Mock process.on and process.exit for signal handling tests
const mockProcessOn = jest.fn();
const mockProcessExit = jest.fn().mockImplementation((code?: number) => {
  throw new Error(`process.exit called with ${code}`); // Make it throw to catch in tests
});

global.process.on = mockProcessOn;
(global.process.exit as jest.Mock) = mockProcessExit;


// Helper to create a mock plugin
const createMockPlugin = (name: string, version = '1.0.0', dependencies: string[] = []): IPlugin => ({
  name,
  version,
  dependencies,
  initialize: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  cleanup: jest.fn().mockResolvedValue(undefined),
});

describe('Service', () => {
  let service: Service;

  beforeEach(() => {
    service = new Service();
    // Clear all mock process functions before each test
    mockProcessOn.mockClear();
    mockProcessExit.mockClear();
    // Clear Logger mocks
    (Logger.info as jest.Mock).mockClear();
    (Logger.warn as jest.Mock).mockClear();
    (Logger.error as jest.Mock).mockClear();
    (Logger.debug as jest.Mock).mockClear();
  });

  describe('Plugin Registration', () => {
    it('should register a plugin successfully', () => {
      const plugin = createMockPlugin('pluginA');
      service.registerPlugin(plugin);
      // @ts-ignore access private property for test
      expect(service['plugins']).toContain(plugin);
      expect(Logger.info).toHaveBeenCalledWith('Plugin "pluginA" registered.');
    });

    it('should prevent registering a plugin with a duplicate name', () => {
      const pluginA = createMockPlugin('pluginA');
      service.registerPlugin(pluginA);
      service.registerPlugin(pluginA); // Attempt to register again
      expect(Logger.error).toHaveBeenCalledWith('Plugin "pluginA" is already registered. Unregister it first or use reloadPlugin.');
      // @ts-ignore
      expect(service['plugins'].length).toBe(1);
    });

    it('should fail to register a plugin with an unregistered dependency', () => {
      const pluginB = createMockPlugin('pluginB', '1.0.0', ['pluginA']);
      service.registerPlugin(pluginB);
      expect(Logger.error).toHaveBeenCalledWith('Plugin "pluginB" requires dependency "pluginA", which is not registered. Registration aborted.');
      // @ts-ignore
      expect(service['plugins']).not.toContain(pluginB);
    });
    
    it('should register plugins with dependencies if dependencies are registered first', () => {
      const pluginA = createMockPlugin('pluginA');
      const pluginB = createMockPlugin('pluginB', '1.0.0', ['pluginA']);
      service.registerPlugin(pluginA);
      service.registerPlugin(pluginB);
      // @ts-ignore
      expect(service['plugins']).toContain(pluginB);
      expect(Logger.info).toHaveBeenCalledWith('Plugin "pluginB" registered.');
    });
  });

  describe('Plugin Unregistration', () => {
    it('should unregister a plugin successfully', async () => {
      const pluginA = createMockPlugin('pluginA');
      service.registerPlugin(pluginA);
      await service.unregisterPlugin('pluginA');
      expect(pluginA.stop).toHaveBeenCalled();
      expect(pluginA.cleanup).toHaveBeenCalled();
      // @ts-ignore
      expect(service['plugins']).not.toContain(pluginA);
      expect(Logger.info).toHaveBeenCalledWith('Plugin "pluginA" successfully unregistered.');
    });

    it('should warn if trying to unregister a non-existent plugin', async () => {
      await service.unregisterPlugin('nonExistentPlugin');
      expect(Logger.warn).toHaveBeenCalledWith('Plugin "nonExistentPlugin" not found for unregistration.');
    });

    it('should prevent unregistering a plugin that is a dependency of another registered plugin', async () => {
      const pluginA = createMockPlugin('pluginA');
      const pluginB = createMockPlugin('pluginB', '1.0.0', ['pluginA']);
      service.registerPlugin(pluginA);
      service.registerPlugin(pluginB);
      await service.unregisterPlugin('pluginA');
      expect(Logger.error).toHaveBeenCalledWith("Cannot unregister plugin \"pluginA\" as it's a dependency for other active plugins: [pluginB].");
      // @ts-ignore
      expect(service['plugins']).toContain(pluginA);
    });
  });

  describe('Service Lifecycle', () => {
    const pluginA = createMockPlugin('pluginA');
    const pluginB = createMockPlugin('pluginB', '1.0.0', ['pluginA']); // B depends on A
    const pluginC = createMockPlugin('pluginC');
    const configs: Record<string, PluginConfig> = {
      pluginA: { settingA: 'valueA' },
      pluginB: { settingB: 'valueB' },
      pluginC: { settingC: 'valueC' },
    };

    beforeEach(() => {
      // Reset plugins array and mocks for each lifecycle test
      service = new Service(); 
      jest.clearAllMocks(); // Clears all jest.fn() calls including plugin methods

      // Re-register plugins for each test to ensure clean state
      service.registerPlugin(pluginA);
      service.registerPlugin(pluginB);
      service.registerPlugin(pluginC);
    });

    it('should initialize plugins with their configurations and dependencies', async () => {
      await service.initializeService(configs);
      expect(pluginA.initialize).toHaveBeenCalledWith(expect.objectContaining(configs.pluginA), expect.any(Map));
      
      // Check dependencies for pluginB
      const pluginBDepMap = (pluginB.initialize as jest.Mock).mock.calls[0][1] as Map<string, IPlugin>;
      expect(pluginBDepMap.get('pluginA')).toBe(pluginA);
      expect(pluginB.initialize).toHaveBeenCalledWith(expect.objectContaining(configs.pluginB), pluginBDepMap);
      
      expect(pluginC.initialize).toHaveBeenCalledWith(expect.objectContaining(configs.pluginC), expect.any(Map));
    });
    
    it('should initialize plugin with empty config and empty dependency map if not provided/no deps', async () => {
      const pluginD = createMockPlugin('pluginD');
      service.registerPlugin(pluginD); 
      await service.initializeService({}); 
      
      expect(pluginD.initialize).toHaveBeenCalledTimes(1); 
      expect(pluginD.initialize).toHaveBeenCalledWith(expect.objectContaining({}), expect.any(Map));
      const depMap = (pluginD.initialize as jest.Mock).mock.calls[0][1] as Map<string, IPlugin>;
      expect(depMap.size).toBe(0);

      // Ensure other plugins (A,B,C) were also initialized (with empty config as per call)
      // These plugins are registered in the beforeEach block for the 'Service Lifecycle' describe
      expect(pluginA.initialize).toHaveBeenCalledWith(expect.objectContaining({}), expect.any(Map));
      expect(pluginB.initialize).toHaveBeenCalledWith(expect.objectContaining({}), expect.any(Map));
      expect(pluginC.initialize).toHaveBeenCalledWith(expect.objectContaining({}), expect.any(Map));
    });

    it('should start all registered plugins', async () => {
      await service.startService();
      expect(pluginA.start).toHaveBeenCalled();
      expect(pluginB.start).toHaveBeenCalled();
      expect(pluginC.start).toHaveBeenCalled();
    });

    it('should stop all registered plugins in reverse order of registration', async () => {
      await service.stopService();
      expect(pluginC.stop).toHaveBeenCalled();
      expect(pluginB.stop).toHaveBeenCalled();
      expect(pluginA.stop).toHaveBeenCalled();
      // Verify order if possible, though Jest's toHaveBeenCalled doesn't guarantee order directly for separate mocks
      // For more precise order checking, one might use a shared spy or check timestamps if critical
    });
    
    it('should cleanup all registered plugins in reverse order and clear plugins array', async () => {
      await service.cleanupService();
      expect(pluginC.cleanup).toHaveBeenCalled();
      expect(pluginB.cleanup).toHaveBeenCalled();
      expect(pluginA.cleanup).toHaveBeenCalled();
      // @ts-ignore
      expect(service['plugins'].length).toBe(0);
    });
    
    it('should handle errors during plugin initialization gracefully', async () => {
        (pluginB.initialize as jest.Mock).mockRejectedValueOnce(new Error('Init failed for B'));
        await service.initializeService(configs);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error initializing plugin "pluginB": Init failed for B'));
        expect(pluginA.initialize).toHaveBeenCalled(); // A should still initialize
        expect(pluginC.initialize).toHaveBeenCalled(); // C should still initialize
    });

    it('should handle errors during plugin start gracefully', async () => {
        (pluginB.start as jest.Mock).mockRejectedValueOnce(new Error('Start failed for B'));
        await service.startService();
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error starting plugin "pluginB": Start failed for B'));
        expect(pluginA.start).toHaveBeenCalled();
        expect(pluginC.start).toHaveBeenCalled();
    });
    
    it('should handle errors during plugin stop gracefully', async () => {
        (pluginB.stop as jest.Mock).mockRejectedValueOnce(new Error('Stop failed for B'));
        await service.stopService();
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error stopping plugin "pluginB": Stop failed for B'));
      expect(pluginA.stop).toHaveBeenCalled(); 
        expect(pluginC.stop).toHaveBeenCalled();
    });

    it('should handle errors during plugin cleanup gracefully', async () => {
      (pluginB.cleanup as jest.Mock).mockRejectedValueOnce(new Error('Cleanup failed for B'));
      // Need to re-register plugins as cleanupService clears them
      service.registerPlugin(pluginA);
      service.registerPlugin(pluginB);
      service.registerPlugin(pluginC);

      await service.cleanupService();
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Error cleaning up plugin "pluginB": Cleanup failed for B'));
      expect(pluginA.cleanup).toHaveBeenCalled();
      expect(pluginC.cleanup).toHaveBeenCalled();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should setup signal handlers for SIGINT and SIGTERM', () => {
      // Constructor calls setupSignalHandlers
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    // Note: Testing the actual process.exit call is tricky and often not done in unit tests.
    // We mock process.exit to throw an error to confirm it would be called.
    // The core logic to test is that stopService and cleanupService are called.
    it('should call stopService and cleanupService on SIGINT', async () => {
        // Find the SIGINT handler registered by the Service
        const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')[1];
        
        // Spy on service methods
        const stopServiceSpy = jest.spyOn(service, 'stopService');
        const cleanupServiceSpy = jest.spyOn(service, 'cleanupService');

        await expect(async () => {
            await sigintHandler();
        }).rejects.toThrow('process.exit called with 0'); // Expect process.exit(0)
        
        expect(Logger.info).toHaveBeenCalledWith('Received SIGINT. Starting graceful shutdown...');
        expect(stopServiceSpy).toHaveBeenCalled();
        expect(cleanupServiceSpy).toHaveBeenCalled();
        expect(Logger.info).toHaveBeenCalledWith('Graceful shutdown completed. Exiting.');
        
        stopServiceSpy.mockRestore();
        cleanupServiceSpy.mockRestore();
    });
    
    it('should only allow one shutdown process to occur', async () => {
        const sigtermHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGTERM')[1];
        
        await expect(sigtermHandler()).rejects.toThrow('process.exit called with 0'); // First call
        // @ts-ignore
        expect(service['isShuttingDown']).toBe(true);
        
        await sigtermHandler(); // Second call
        expect(Logger.info).toHaveBeenCalledWith('Shutdown already in progress. Received SIGTERM again.');
    });

    it('should prevent plugin registration during shutdown', () => {
      // @ts-ignore
      service['isShuttingDown'] = true;
      const plugin = createMockPlugin('shutdownPlugin');
      service.registerPlugin(plugin);
      expect(Logger.warn).toHaveBeenCalledWith('Cannot register plugin "shutdownPlugin" during shutdown.');
      // @ts-ignore
      expect(service['plugins']).not.toContain(plugin);
    });

    it('should prevent plugin unregistration during shutdown', async () => {
      const plugin = createMockPlugin('pluginToUnregister');
      service.registerPlugin(plugin);
      // @ts-ignore
      service['isShuttingDown'] = true;
      await service.unregisterPlugin('pluginToUnregister');
      expect(Logger.warn).toHaveBeenCalledWith('Cannot unregister plugin "pluginToUnregister" during shutdown.');
      // @ts-ignore
      expect(service['plugins']).toContain(plugin); // Should still be there
    });
  });
  
  describe('Event Emission', () => {
    let eventEmitterSpy: jest.SpyInstance;

    beforeEach(() => {
      eventEmitterSpy = jest.spyOn(service.getEventEmitter(), 'emit');
    });

    afterEach(() => {
      eventEmitterSpy.mockRestore();
    });

    it('should emit events during plugin registration', () => {
      const plugin = createMockPlugin('eventPlugin');
      service.registerPlugin(plugin);
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:registering', { pluginName: 'eventPlugin' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:registered', { pluginName: 'eventPlugin', version: plugin.version });
    });
    
    it('should emit registrationFailed event if plugin dependency is missing', () => {
      const plugin = createMockPlugin('eventPluginWithMissingDep', '1.0.0', ['missingDep']);
      service.registerPlugin(plugin);
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:registering', { pluginName: 'eventPluginWithMissingDep' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:registrationFailed', { 
        pluginName: 'eventPluginWithMissingDep', 
        error: 'Plugin "eventPluginWithMissingDep" requires dependency "missingDep", which is not registered. Registration aborted.'
      });
    });

    it('should emit events during unregistration', async () => {
      const plugin = createMockPlugin('eventPluginToUnregister');
      service.registerPlugin(plugin);
      eventEmitterSpy.mockClear(); // Clear registration events

      await service.unregisterPlugin('eventPluginToUnregister');
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:unregistering', { pluginName: 'eventPluginToUnregister' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:stopping', { pluginName: 'eventPluginToUnregister' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:stopped', { pluginName: 'eventPluginToUnregister' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:cleaningUp', { pluginName: 'eventPluginToUnregister' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:cleanedUp', { pluginName: 'eventPluginToUnregister' });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:unregistered', { pluginName: 'eventPluginToUnregister' });
    });
    
    it('should emit unregistrationFailed event if plugin not found', async () => {
        await service.unregisterPlugin('nonExistent');
        expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:unregistering', { pluginName: 'nonExistent' });
        expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:unregistrationFailed', { 
            pluginName: 'nonExistent', 
            error: 'Plugin "nonExistent" not found for unregistration.' 
        });
    });

    it('should emit events for plugin lifecycle failures', async () => {
      const pluginFail = createMockPlugin('pluginFail');
      service.registerPlugin(pluginFail);
      const initError = new Error('Init Fail');
      const startError = new Error('Start Fail');
      const stopError = new Error('Stop Fail');
      const cleanupError = new Error('Cleanup Fail');

      (pluginFail.initialize as jest.Mock).mockRejectedValueOnce(initError);
      await service.initializeService({ pluginFail: {} });
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:initializationFailed', { pluginName: 'pluginFail', error: initError });

      (pluginFail.start as jest.Mock).mockRejectedValueOnce(startError);
      await service.startService();
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:startFailed', { pluginName: 'pluginFail', error: startError });
      
      // For stop/cleanup, need to trigger shutdown or unregister
      (pluginFail.stop as jest.Mock).mockRejectedValueOnce(stopError);
      await service.stopService(); // stopService calls stop on plugins
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:stopFailed', { pluginName: 'pluginFail', error: stopError });
      
      (pluginFail.cleanup as jest.Mock).mockRejectedValueOnce(cleanupError);
      await service.cleanupService(); // cleanupService calls cleanup on plugins
      expect(eventEmitterSpy).toHaveBeenCalledWith('plugin:cleanupFailed', { pluginName: 'pluginFail', error: cleanupError });
    });


    it('should emit events during service lifecycle methods', async () => {
      // Clear previous event calls from plugin registration in beforeEach
      eventEmitterSpy.mockClear(); 
      const configs = {};

      await service.initializeService(configs);
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:initializing');
      // Plugin lifecycle events are tested elsewhere or implicitly via success of these
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:initialized');

      await service.startService();
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:starting');
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:started');
      
      await service.stopService();
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:stopping');
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:stopped');
      
      await service.cleanupService();
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:cleaningUp');
      expect(eventEmitterSpy).toHaveBeenCalledWith('service:cleanedUp');
    });
  });
});
