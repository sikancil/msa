import { MCPPlugin, MCPPluginConfig } from '../src';
import { MCPClient } from '../src/MCPClient';
import { Logger } from '@arifwidianto/msa-core';

// Mock Logger
jest.mock('@arifwidianto/msa-core', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock MCPClient
const mockMCPClientInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  sendRequest: jest.fn(),
  setOnMessageHandler: jest.fn(),
};
jest.mock('../src/MCPClient', () => ({
  MCPClient: jest.fn(() => mockMCPClientInstance),
}));


describe('MCPPlugin', () => {
  let plugin: MCPPlugin;
  const config: MCPPluginConfig = { serverUrl: 'ws://test-server.com/mcp' };

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new MCPPlugin();
  });

  describe('Initialization', () => {
    it('should initialize MCPClient with serverUrl from config', async () => {
      await plugin.initialize(config);
      expect(MCPClient).toHaveBeenCalledWith(config.serverUrl, undefined, undefined, undefined); // Check for optional params too
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(`Initializing with server URL: ${config.serverUrl}`));
      expect(plugin.getClient()).toBe(mockMCPClientInstance);
    });

    it('should throw error if serverUrl is not provided', async () => {
      // Pass an empty object or a config without serverUrl
      await expect(plugin.initialize({} as MCPPluginConfig)).rejects.toThrow(
        `${plugin.name}: serverUrl is missing in plugin configuration.`
      );
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('serverUrl is required'));
    });
    
    it('should pass through client constructor options', async () => {
        const fullConfig: MCPPluginConfig = {
            serverUrl: 'ws://test.com',
            autoReconnectClient: false,
            maxReconnectAttemptsClient: 10,
            reconnectIntervalClient: 2000
        };
        await plugin.initialize(fullConfig);
        expect(MCPClient).toHaveBeenCalledWith(
            fullConfig.serverUrl,
            fullConfig.autoReconnectClient,
            fullConfig.maxReconnectAttemptsClient,
            fullConfig.reconnectIntervalClient
        );
    });
  });

  describe('Start', () => {
    it('should call connect on the MCPClient', async () => {
      await plugin.initialize(config);
      await plugin.start();
      expect(mockMCPClientInstance.connect).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('MCPClient connected successfully.'));
    });

    it('should throw error if start is called before initialize', async () => {
      await expect(plugin.start()).rejects.toThrow('Client not initialized.');
    });
    
    it('should handle connection errors from MCPClient on start', async () => {
        const connectError = new Error("Connection refused");
        (mockMCPClientInstance.connect as jest.Mock).mockRejectedValueOnce(connectError);
        await plugin.initialize(config);
        await expect(plugin.start()).rejects.toThrow(connectError);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to connect MCPClient: ${connectError.message}`));
    });
  });

  describe('Stop', () => {
    it('should call close on the MCPClient', async () => {
      await plugin.initialize(config);
      // await plugin.start(); // Not strictly necessary for stop test if client exists
      await plugin.stop();
      expect(mockMCPClientInstance.close).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('MCPClient connection closed.'));
    });
    
    it('should log if stop is called but no client instance exists (e.g. not initialized)', async () => {
        await plugin.stop();
        expect(Logger.info).toHaveBeenCalledWith(`${plugin.name}: No MCPClient instance to stop.`);
        expect(mockMCPClientInstance.close).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should close client and nullify resources', async () => {
      await plugin.initialize(config);
      const clientInstance = plugin.getClient(); // Get instance before cleanup
      
      await plugin.cleanup();
      
      expect(clientInstance.close).toHaveBeenCalled(); // Check on the captured instance
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Cleaning up resources.'));
      // @ts-ignore
      expect(plugin['client']).toBeNull();
      // @ts-ignore
      expect(plugin['config']).toBeNull();
    });
  });

  describe('getClient', () => {
    it('should return the MCPClient instance after initialization', async () => {
      await plugin.initialize(config);
      expect(plugin.getClient()).toBe(mockMCPClientInstance);
    });

    it('should throw error if getClient is called before initialization', () => {
      expect(() => plugin.getClient()).toThrow(
        `${plugin.name}: Plugin not initialized or client not available.`
      );
    });
  });
});
