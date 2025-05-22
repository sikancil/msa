import { IPlugin, PluginConfig } from './interfaces/IPlugin';
import { Logger } from './Logger';

export class Service {
  private plugins: IPlugin[] = [];
  private isShuttingDown = false;

  constructor() {
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, async () => {
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
    if (this.isShuttingDown) {
      Logger.warn(`Cannot register plugin "${plugin.name}" during shutdown.`);
      return;
    }
    // Basic dependency checking
    plugin.dependencies.forEach(depName => {
      if (!this.plugins.some(p => p.name === depName)) {
        Logger.warn(`Plugin "${plugin.name}" depends on "${depName}", which is not registered or registered after this plugin.`);
      }
    });
    this.plugins.push(plugin);
    Logger.info(`Plugin "${plugin.name}" registered.`);
  }

  public async initializeService(configs: Record<string, PluginConfig>): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn('Cannot initialize service during shutdown.');
      return;
    }
    Logger.info('Initializing service...');
    for (const plugin of this.plugins) {
      try {
        const pluginConfig = configs[plugin.name] || {};
        Logger.info(`Initializing plugin "${plugin.name}"...`);
        await plugin.initialize(pluginConfig);
        Logger.info(`Plugin "${plugin.name}" initialized.`);
      } catch (error) {
        Logger.error(`Error initializing plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other plugins
      }
    }
    Logger.info('Service initialized.');
  }

  public async startService(): Promise<void> {
    if (this.isShuttingDown) {
      Logger.warn('Cannot start service during shutdown.');
      return;
    }
    Logger.info('Starting service...');
    for (const plugin of this.plugins) {
      try {
        Logger.info(`Starting plugin "${plugin.name}"...`);
        await plugin.start();
        Logger.info(`Plugin "${plugin.name}" started.`);
      } catch (error) {
        Logger.error(`Error starting plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other plugins
      }
    }
    Logger.info('Service started.');
  }

  public async stopService(): Promise<void> {
    Logger.info('Stopping service...');
    // Stop plugins in reverse order of registration
    for (const plugin of [...this.plugins].reverse()) {
      try {
        Logger.info(`Stopping plugin "${plugin.name}"...`);
        await plugin.stop();
        Logger.info(`Plugin "${plugin.name}" stopped.`);
      } catch (error) {
        Logger.error(`Error stopping plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other plugins to ensure maximum resource release
      }
    }
    Logger.info('Service stopped.');
  }

  public async cleanupService(): Promise<void> {
    Logger.info('Cleaning up service...');
    // Cleanup plugins in reverse order of registration
    for (const plugin of [...this.plugins].reverse()) {
      try {
        Logger.info(`Cleaning up plugin "${plugin.name}"...`);
        await plugin.cleanup();
        Logger.info(`Plugin "${plugin.name}" cleaned up.`);
      } catch (error) {
        Logger.error(`Error cleaning up plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other plugins
      }
    }
    this.plugins = []; // Clear plugins after cleanup
    Logger.info('Service cleaned up.');
  }
}
