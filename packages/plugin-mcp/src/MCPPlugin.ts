import { IPlugin, Logger, ITransport } from '@arifwidianto/msa-core';
import { MCPClient } from './MCPClient';
import { MCPPluginConfig } from './MCPPluginConfig';
import { MCPServer, MCPRequestHandler } from './MCPServer'; // Import MCPServer

// Helper type for core access if it were to be formalized
// export interface CorePluginAccess {
//   getService: () => any; // Replace 'any' with actual Service type
//   getLogger: (context: string) => Logger;
//   getPlugin: <T extends IPlugin>(pluginName: string) => T | undefined;
// }


export class MCPPlugin implements IPlugin {
  public readonly name = 'msa-plugin-mcp';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private client: MCPClient | null = null;
  private serverInstance: MCPServer | null = null;
  private config: MCPPluginConfig | null = null;
  // private logger: Logger; // Assume Logger is directly usable or passed via a CorePluginAccess object

  // If core framework passes core utilities:
  // constructor(private coreAccess?: CorePluginAccess) {
  //   this.logger = coreAccess ? coreAccess.getLogger(this.name) : Logger; // Fallback to global Logger
  // }
  // For now, using imported Logger directly as per previous plugins.

  public async initialize(
    config: MCPPluginConfig,
    dependencies: Map<string, IPlugin> // This would be supplied by the service orchestrator
  ): Promise<void> {
    this.config = config;
    // Logger.debug(`Plugin ${this.name} received dependencies: ${Array.from(dependencies.keys())}`);
    // this.logger = this.coreAccess?.getLogger(this.name) || Logger; // Example if coreAccess was real

    Logger.info(`${this.name}: Initializing...`);

    // Initialize Client
    if (config.client?.serverUrl) {
      Logger.info(`${this.name}: Client mode configured with server URL: ${config.client.serverUrl}`);
      this.client = new MCPClient(
        config.client.serverUrl,
        config.client.autoReconnectClient, // Now correctly named as per updated MCPPluginConfig
        config.client.maxReconnectAttemptsClient,
        config.client.reconnectIntervalClient
      );
    } else {
      Logger.info(`${this.name}: Client mode not configured or serverUrl missing.`);
    }

    // Initialize Server
    // The transportForServer logic needs to be re-evaluated.
    // For now, it's removed as it's not directly provided by the new initialize signature.
    // It might need to be fetched from `dependencies` if a transport plugin is listed as a dependency.
    if (config.server?.enabled) {
      Logger.info(`${this.name}: Server mode enabled.`);
      const transportPluginName = config.server.transportPluginName; // Assuming this field exists in MCPPluginConfig
      let transportForServer: ITransport | undefined;

      if (transportPluginName) {
        const transportDep = dependencies.get(transportPluginName);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (transportDep && typeof (transportDep as any).listen === 'function' && typeof (transportDep as any).send === 'function' && typeof (transportDep as any).onMessage === 'function' && typeof (transportDep as any).close === 'function') { // Check if it's an ITransport
          transportForServer = transportDep as unknown as ITransport;
        } else {
          Logger.warn(`${this.name}: Specified transport plugin "${transportPluginName}" not found or not a valid ITransport in dependencies.`);
        }
      }

      if (transportForServer) {
        this.serverInstance = new MCPServer(transportForServer, Logger); // Pass the Logger
        Logger.info(`${this.name}: MCPServer instance created and attached to transport "${transportPluginName}".`);
      } else {
        const errorMsg = `${this.name}: Server mode enabled, but required transport plugin instance ("${transportPluginName || 'N/A'}") was not found or invalid in dependencies. MCPServer will not function.`;
        Logger.error(errorMsg);
      }
    } else {
      Logger.info(`${this.name}: Server mode not enabled.`);
    }
    Logger.info(`${this.name}: Initialization complete.`);
  }

  public async start(): Promise<void> {
    Logger.info(`${this.name}: Starting...`);
    if (this.client) {
      try {
        Logger.info(`${this.name}: Connecting MCPClient...`);
        await this.client.connect();
        Logger.info(`${this.name}: MCPClient connected successfully.`);
      } catch (error) {
        Logger.error(`${this.name}: Failed to connect MCPClient during start: ${error instanceof Error ? error.message : String(error)}`);
        // Decide if this should prevent service start or just log
      }
    }
    // MCPServer component is passive; it's "started" when its transport is started.
    // No specific start action for serverInstance here as transport lifecycle is external.
    if (this.serverInstance) {
        Logger.info(`${this.name}: MCPServer is active (relies on its transport plugin's lifecycle).`);
    }
    Logger.info(`${this.name}: Start routine complete.`);
  }

  public async stop(): Promise<void> {
    Logger.info(`${this.name}: Stopping...`);
    if (this.client) {
      Logger.info(`${this.name}: Closing MCPClient connection...`);
      this.client.close();
      Logger.info(`${this.name}: MCPClient connection closed.`);
    }
    // MCPServer component is passive; its transport is stopped by its own plugin's lifecycle.
    if (this.serverInstance) {
        Logger.info(`${this.name}: MCPServer will stop receiving messages when its transport stops.`);
    }
    Logger.info(`${this.name}: Stop routine complete.`);
  }

  public async cleanup(): Promise<void> {
    Logger.info(`${this.name}: Cleaning up resources...`);
    if (this.client) {
      this.client.close(); // Ensure client connection is closed
      this.client = null;
    }
    if (this.serverInstance) {
      // MCPServer might have resources to clean up if it managed more than just handlers
      // For now, it mainly holds references; nullifying should be sufficient.
      // If MCPServer had, e.g., its own timers or persistent stores, they'd be cleaned here.
      Logger.info(`${this.name}: Cleaning up MCPServer instance.`);
      this.serverInstance = null;
    }
    this.config = null;
    Logger.info(`${this.name}: Cleanup complete.`);
  }

  /**
   * Provides access to the underlying MCPClient instance.
   * @returns The MCPClient instance.
   * @throws Error if the client part of the plugin has not been configured or initialized.
   */
  public getClient(): MCPClient {
    if (!this.client) {
      const errorMsg = `${this.name}: MCPClient is not available. Client mode may not be configured or plugin not initialized.`;
      Logger.warn(errorMsg);
      throw new Error(errorMsg);
    }
    return this.client;
  }

  /**
   * Registers an action handler for the MCP Server.
   * @param action The action string to register.
   * @param handler The handler function for the action.
   * @throws Error if the server part of the plugin is not initialized or enabled.
   */
  public registerServerAction(action: string, handler: MCPRequestHandler): void {
    if (!this.serverInstance) {
      const errorMsg = `${this.name}: MCPServer is not initialized or enabled. Cannot register action.`;
      Logger.warn(errorMsg);
      throw new Error(errorMsg);
    }
    this.serverInstance.registerAction(action, handler);
  }

  /**
   * Provides access to the underlying MCPServer instance.
   * Useful for advanced configuration or direct interaction not exposed via MCPPlugin.
   * @returns The MCPServer instance.
   * @throws Error if the server part of the plugin has not been configured or initialized.
   */
  public getServer(): MCPServer {
    if (!this.serverInstance) {
      const errorMsg = `${this.name}: MCPServer is not available. Server mode may not be configured or plugin not initialized.`;
      Logger.warn(errorMsg);
      throw new Error(errorMsg);
    }
    return this.serverInstance;
  }
}
