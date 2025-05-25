import { IPlugin, PluginConfig } from './interfaces/IPlugin';
import { Logger } from './Logger';
import { EventEmitter } from 'events';

export class Service {
  private plugins: IPlugin[] = [];
  private isShuttingDown = false;
  private eventEmitter: EventEmitter;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.setupSignalHandlers();
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        this.eventEmitter.emit('service:signalReceived', { signal });
        if (!this.isShuttingDown) {
          this.isShuttingDown = true;
          Logger.info(`Received ${signal}. Starting graceful shutdown...`);
          await this.stopService();
          await this.cleanupService();
          Logger.info('Graceful shutdown completed. Exiting.');
          process.exit(0);
        } else {
          Logger.info(`Shutdown already in progress. Received ${signal} again.`);
        }
      });
    });
  }

  public registerPlugin(plugin: IPlugin): void {
    this.eventEmitter.emit('plugin:registering', { pluginName: plugin.name });
    if (this.isShuttingDown) {
      const errorMsg = `Cannot register plugin "${plugin.name}" during shutdown.`;
      Logger.warn(errorMsg);
      this.eventEmitter.emit('plugin:registrationFailed', { pluginName: plugin.name, error: errorMsg });
      return;
    }
    // Check if plugin with the same name is already registered
    if (this.plugins.some(p => p.name === plugin.name)) {
      const errorMsg = `Plugin "${plugin.name}" is already registered. Unregister it first or use reloadPlugin.`;
      Logger.error(errorMsg);
      this.eventEmitter.emit('plugin:registrationFailed', { pluginName: plugin.name, error: errorMsg });
      return;
    }

    // Dependency Validation Logic (simple name check)
    for (const depName of plugin.dependencies) {
      const registeredDepPlugin = this.plugins.find(p => p.name === depName);

      if (!registeredDepPlugin) {
        const errorMsg = `Plugin "${plugin.name}" requires dependency "${depName}", which is not registered. Registration aborted.`;
        Logger.error(errorMsg);
        this.eventEmitter.emit('plugin:registrationFailed', { pluginName: plugin.name, error: errorMsg });
        return; // Registration fails
      }
      // Version compatibility can be handled by plugin developers or a more sophisticated manager
    }

    this.plugins.push(plugin);
    Logger.info(`Plugin "${plugin.name}" registered.`);
    this.eventEmitter.emit('plugin:registered', { pluginName: plugin.name, version: plugin.version });
  }

  public async unregisterPlugin(pluginName: string): Promise<void> {
    this.eventEmitter.emit('plugin:unregistering', { pluginName });
    if (this.isShuttingDown) {
      const errorMsg = `Cannot unregister plugin "${pluginName}" during shutdown.`;
      Logger.warn(errorMsg);
      this.eventEmitter.emit('plugin:unregistrationFailed', { pluginName, error: errorMsg });
      return;
    }

    const pluginIndex = this.plugins.findIndex(p => p.name === pluginName);

    if (pluginIndex === -1) {
      const errorMsg = `Plugin "${pluginName}" not found for unregistration.`;
      Logger.warn(errorMsg);
      this.eventEmitter.emit('plugin:unregistrationFailed', { pluginName, error: errorMsg });
      return;
    }

    const pluginToUnregister = this.plugins[pluginIndex];
    Logger.info(`Unregistering plugin "${pluginName}"...`);

    // Dependency Check - Updated for string[]
    const dependentPlugins = this.plugins.filter(p => 
      p.dependencies.includes(pluginName) && p.name !== pluginName
    );
    if (dependentPlugins.length > 0) {
      const dependentPluginNames = dependentPlugins.map(p => p.name);
      const errorMsg = `Cannot unregister plugin "${pluginName}" as it's a dependency for other active plugins: [${dependentPluginNames.join(', ')}].`;
      Logger.error(errorMsg);
      this.eventEmitter.emit('plugin:unregistrationFailed', { pluginName, error: errorMsg });
      return;
    }

    try {
      Logger.info(`Stopping plugin "${pluginToUnregister.name}"...`);
      await pluginToUnregister.stop();
      Logger.info(`Plugin "${pluginToUnregister.name}" stopped.`);
      this.eventEmitter.emit('plugin:stopped', { pluginName: pluginToUnregister.name }); // Added event
    } catch (error) {
      const errorMsg = `Error stopping plugin "${pluginToUnregister.name}": ${error instanceof Error ? error.message : String(error)}`;
      Logger.error(errorMsg);
      this.eventEmitter.emit('plugin:stopFailed', { pluginName: pluginToUnregister.name, error: error instanceof Error ? error : new Error(errorMsg) }); // Added event
    }

    try {
      Logger.info(`Cleaning up plugin "${pluginToUnregister.name}"...`);
      await pluginToUnregister.cleanup();
      Logger.info(`Plugin "${pluginToUnregister.name}" cleaned up.`);
      this.eventEmitter.emit('plugin:cleanedUp', { pluginName: pluginToUnregister.name }); // Added event
    } catch (error) {
      const errorMsg = `Error cleaning up plugin "${pluginToUnregister.name}": ${error instanceof Error ? error.message : String(error)}`;
      Logger.error(errorMsg);
      this.eventEmitter.emit('plugin:cleanupFailed', { pluginName: pluginToUnregister.name, error: error instanceof Error ? error : new Error(errorMsg) }); // Added event
    }

    this.plugins.splice(pluginIndex, 1);
    Logger.info(`Plugin "${pluginName}" successfully unregistered.`);
    this.eventEmitter.emit('plugin:unregistered', { pluginName });
  }

  public async initializeService(configs: Record<string, PluginConfig>): Promise<void> {
    this.eventEmitter.emit('service:initializing');
    if (this.isShuttingDown) {
      Logger.warn('Cannot initialize service during shutdown.');
      // Optionally emit a service level failure if needed
      return;
    }
    Logger.info('Initializing service...');
    for (const plugin of this.plugins) {
      this.eventEmitter.emit('plugin:initializing', { pluginName: plugin.name });
      try {
        const pluginConfig = configs[plugin.name] || {};
        Logger.info(`Initializing plugin "${plugin.name}"...`);

        // Create and populate dependencies map for the current plugin
        const dependenciesMap = new Map<string, IPlugin>();
        if (plugin.dependencies && plugin.dependencies.length > 0) {
          for (const depName of plugin.dependencies) {
            const foundPluginInstance = this.plugins.find(p => p.name === depName);
            if (foundPluginInstance) {
              dependenciesMap.set(depName, foundPluginInstance);
            } else {
              // This case should ideally not be reached if registerPlugin ensures dependencies exist
              Logger.warn(`During initialization of "${plugin.name}", dependency plugin "${depName}" was not found in registered plugins.`);
            }
          }
        }

        await plugin.initialize(pluginConfig, dependenciesMap);
        Logger.info(`Plugin "${plugin.name}" initialized.`);
        this.eventEmitter.emit('plugin:initialized', { pluginName: plugin.name });
      } catch (error) {
        const errorMsg = `Error initializing plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`;
        Logger.error(errorMsg);
        this.eventEmitter.emit('plugin:initializationFailed', { pluginName: plugin.name, error: error instanceof Error ? error : new Error(String(error)) });
        // Continue with other plugins
      }
    }
    Logger.info('Service initialized.');
    this.eventEmitter.emit('service:initialized');
  }

  public async startService(): Promise<void> {
    this.eventEmitter.emit('service:starting');
    if (this.isShuttingDown) {
      Logger.warn('Cannot start service during shutdown.');
      return;
    }
    Logger.info('Starting service...');
    for (const plugin of this.plugins) {
      this.eventEmitter.emit('plugin:starting', { pluginName: plugin.name });
      try {
        Logger.info(`Starting plugin "${plugin.name}"...`);
        await plugin.start();
        Logger.info(`Plugin "${plugin.name}" started.`);
        this.eventEmitter.emit('plugin:started', { pluginName: plugin.name });
      } catch (error) {
        const errorMsg = `Error starting plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`;
        Logger.error(errorMsg);
        this.eventEmitter.emit('plugin:startFailed', { pluginName: plugin.name, error: error instanceof Error ? error : new Error(String(error)) });
        // Continue with other plugins
      }
    }
    Logger.info('Service started.');
    this.eventEmitter.emit('service:started');
  }

  public async stopService(): Promise<void> {
    this.eventEmitter.emit('service:stopping');
    Logger.info('Stopping service...');
    // Stop plugins in reverse order of registration
    for (const plugin of [...this.plugins].reverse()) {
      this.eventEmitter.emit('plugin:stopping', { pluginName: plugin.name });
      try {
        Logger.info(`Stopping plugin "${plugin.name}"...`);
        await plugin.stop();
        Logger.info(`Plugin "${plugin.name}" stopped.`);
        this.eventEmitter.emit('plugin:stopped', { pluginName: plugin.name });
      } catch (error) {
        const errorMsg = `Error stopping plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`;
        Logger.error(errorMsg);
        this.eventEmitter.emit('plugin:stopFailed', { pluginName: plugin.name, error: error instanceof Error ? error : new Error(String(error)) });
        // Continue with other plugins to ensure maximum resource release
      }
    }
    Logger.info('Service stopped.');
    this.eventEmitter.emit('service:stopped');
  }

  public async cleanupService(): Promise<void> {
    this.eventEmitter.emit('service:cleaningUp');
    Logger.info('Cleaning up service...');
    // Cleanup plugins in reverse order of registration
    for (const plugin of [...this.plugins].reverse()) {
      this.eventEmitter.emit('plugin:cleaningUp', { pluginName: plugin.name });
      try {
        Logger.info(`Cleaning up plugin "${plugin.name}"...`);
        await plugin.cleanup();
        Logger.info(`Plugin "${plugin.name}" cleaned up.`);
        this.eventEmitter.emit('plugin:cleanedUp', { pluginName: plugin.name });
      } catch (error) {
        const errorMsg = `Error cleaning up plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`;
        Logger.error(errorMsg);
        this.eventEmitter.emit('plugin:cleanupFailed', { pluginName: plugin.name, error: error instanceof Error ? error : new Error(String(error)) });
        // Continue with other plugins
      }
    }
    this.plugins = []; // Clear plugins after cleanup
    Logger.info('Service cleaned up.');
    this.eventEmitter.emit('service:cleanedUp');
  }
}
