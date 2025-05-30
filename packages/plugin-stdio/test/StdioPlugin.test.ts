import { StdioPlugin, StdioPluginConfig } from '../src';
import { Logger, MessageHandler } from '@arifwidianto/msa-core';
import yargs, { ArgumentsCamelCase, Argv } from 'yargs';
import inquirer from 'inquirer';
import readline from 'readline';

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

// Mock yargs
const mockYargsInstance = {
  command: jest.fn().mockReturnThis(),
  scriptName: jest.fn().mockReturnThis(),
  usage: jest.fn().mockReturnThis(),
  help: jest.fn().mockReturnThis(),
  alias: jest.fn().mockReturnThis(),
  demandCommand: jest.fn().mockReturnThis(),
  strict: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  parseAsync: jest.fn().mockResolvedValue({ _: [], $0: '' }), // Default mock for parseAsync
  showHelp: jest.fn(),
};
jest.mock('yargs', () => jest.fn(() => mockYargsInstance));
jest.mock('yargs/helpers', () => ({ hideBin: jest.fn((x) => x) }));


// Mock inquirer
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

// Mock readline
const mockReadlineInterface = {
  prompt: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
};
jest.mock('readline', () => ({
  createInterface: jest.fn(() => mockReadlineInterface),
}));


describe('StdioPlugin', () => {
  let plugin: StdioPlugin;
  const defaultConfig: StdioPluginConfig = { interactive: false };

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new StdioPlugin();
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      await plugin.initialize({}, new Map());
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('initialized with config: {}'));
      expect(yargs).toHaveBeenCalled();
      expect(mockYargsInstance.scriptName).toHaveBeenCalled();
    });

    it('should initialize with provided config', async () => {
      await plugin.initialize(defaultConfig, new Map());
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify(defaultConfig)));
    });
  });

  describe('Command Handling', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('should add a command handler and register it with yargs', () => {
      const handler = jest.fn();
      const builder = { testOption: { type: 'string' } };
      plugin.addCommandHandler('testCmd <arg>', 'A test command', builder as any, handler);
      
      expect(mockYargsInstance.command).toHaveBeenCalledWith(expect.objectContaining({
        command: 'testCmd <arg>',
        describe: 'A test command',
        builder: builder,
        // handler: expect.any(Function) // The actual handler is wrapped
      }));
      expect(Logger.info).toHaveBeenCalledWith('StdIO Plugin: Command handler added for "testCmd <arg>"');
    });

    it('command handler should call specific handler and global message handler if registered', async () => {
        const specificHandler = jest.fn();
        const globalMessageHandler = jest.fn();
        plugin.onMessage(globalMessageHandler);

        plugin.addCommandHandler('cmd', 'desc', {}, specificHandler);

        // Simulate yargs calling the handler
        const yargsRegisteredHandler = mockYargsInstance.command.mock.calls[0][0].handler;
        const mockArgs = { _: ['cmd'], $0: 'test', arg1: 'val1' } as ArgumentsCamelCase<{arg1: string}>;
        
        await yargsRegisteredHandler(mockArgs);

        expect(specificHandler).toHaveBeenCalledWith(mockArgs);
        expect(globalMessageHandler).toHaveBeenCalledWith(expect.objectContaining({
            type: 'command',
            command: 'cmd',
            arguments: mockArgs
        }));
    });
  });

  describe('Start Method', () => {
    beforeEach(async () => {
      await plugin.initialize({ interactive: true }, new Map()); // Enable interactive for some tests
    });

    it('should parse argv using yargs', async () => {
      await plugin.start();
      expect(mockYargsInstance.parseAsync).toHaveBeenCalled();
    });

    it('should start interactive input if no command and interactive is true', async () => {
      (mockYargsInstance.parseAsync as jest.Mock).mockResolvedValueOnce({ _: [], $0: '' }); // Simulate no command
      const startInteractiveSpy = jest.spyOn(plugin, 'startInteractiveInput');
      await plugin.start();
      expect(startInteractiveSpy).toHaveBeenCalled();
    });
    
    it('should show help if no command and interactive is false', async () => {
        const nonInteractivePlugin = new StdioPlugin();
        await nonInteractivePlugin.initialize({ interactive: false }, new Map());
        (mockYargsInstance.parseAsync as jest.Mock).mockResolvedValueOnce({ _: [], $0: '' });
        await nonInteractivePlugin.start();
        expect(mockYargsInstance.showHelp).toHaveBeenCalled();
    });
  });
  
  describe('Interactive Input', () => {
    beforeEach(async () => {
      await plugin.initialize({ promptPrefix: 'test> ' }, new Map());
    });

    it('startInteractiveInput should setup readline and prompt', () => {
      plugin.startInteractiveInput();
      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
        prompt: 'test> '
      });
      expect(mockReadlineInterface.prompt).toHaveBeenCalled();
      expect(mockReadlineInterface.on).toHaveBeenCalledWith('line', expect.any(Function));
      expect(mockReadlineInterface.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle "exit" command in interactive mode', async () => {
      plugin.startInteractiveInput();
      const lineHandler = mockReadlineInterface.on.mock.calls.find(call => call[0] === 'line')[1];
      const stopSpy = jest.spyOn(plugin, 'stop');
      await lineHandler('exit');
      expect(stopSpy).toHaveBeenCalled();
    });
    
    it('should pass line to messageHandler if registered', async () => {
        const messageHandler = jest.fn();
        plugin.onMessage(messageHandler);
        plugin.startInteractiveInput();
        const lineHandler = mockReadlineInterface.on.mock.calls.find(call => call[0] === 'line')[1];
        await lineHandler('interactive input line');
        expect(messageHandler).toHaveBeenCalledWith('interactive input line');
        expect(mockReadlineInterface.prompt).toHaveBeenCalledTimes(2); // Initial + after line
    });
  });


  describe('ITransport Methods', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    beforeEach(async () => {
      consoleSpy.mockClear();
      await plugin.initialize(defaultConfig, new Map());
    });

    it('send() should print string message to console', async () => {
      await plugin.send('Test output');
      expect(consoleSpy).toHaveBeenCalledWith('Test output');
    });
    
    it('send() should JSON.stringify object messages', async () => {
        const message = { data: 'test', value: 123 };
        await plugin.send(message);
        expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(message, null, 2));
    });

    it('onMessage() should register a message handler', () => {
      const handler = jest.fn();
      plugin.onMessage(handler);
      // @ts-ignore
      expect(plugin['messageHandler']).toBe(handler);
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Generic message handler registered.'));
    });

    it('listen() should log and potentially start interactive input if configured', async () => {
        const interactivePlugin = new StdioPlugin();
        await interactivePlugin.initialize({ interactive: true }, new Map());
        const startInteractiveSpy = jest.spyOn(interactivePlugin, 'startInteractiveInput');
        
        // Calling listen() on its own might not trigger interactive mode based on current StdioPlugin logic.
        // Interactive mode is primarily triggered by start() if no commands are given OR by explicit call to startInteractiveInput().
        // The listen() method's comment says "If interactive mode is desired by default, it can be triggered here or in start()."
        // The current implementation of listen() does not trigger it.
        await interactivePlugin.listen(); 
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('listen() called.'));
        // Based on current implementation, listen() doesn't start interactive mode itself.
        // If it were to, this spy would be called:
        // expect(startInteractiveSpy).toHaveBeenCalled(); 
    });
    
    it('close() should call stop', async () => {
        const stopSpy = jest.spyOn(plugin, 'stop');
        await plugin.close();
        expect(stopSpy).toHaveBeenCalled();
    });
  });
  
  describe('Prompt Method', () => {
    it('prompt() should call inquirer.prompt', async () => {
        const questions = [{ type: 'input', name: 'testQ' }];
        const answers = { testQ: 'testA' };
        (inquirer.prompt as unknown as jest.Mock).mockResolvedValueOnce(answers);

        const result = await plugin.prompt(questions as any);
        expect(inquirer.prompt).toHaveBeenCalledWith(questions);
        expect(result).toBe(answers);
    });
  });

  describe('Cleanup', () => {
    it('should log cleanup message and clear handlers', async () => {
        await plugin.initialize(defaultConfig, new Map());
        plugin.addCommandHandler('cmd', 'desc', {}, jest.fn());
        // @ts-ignore
        expect(plugin['commandHandlers'].size).toBeGreaterThan(0); // This is not how commands are stored in yargs

        await plugin.cleanup();
        // @ts-ignore
        expect(plugin['yargsInstance']).toBeNull();
        // @ts-ignore
        expect(plugin['commandHandlers'].size).toBe(0); // This map is used internally before configuring yargs
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('cleaned up.'));
    });
  });
});
