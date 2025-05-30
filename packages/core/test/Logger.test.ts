// Import L// Mock pino and pino-pretty
jest.mock('pino', () => {
  return jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    setBindings: jest.fn(), // Mock this method as it's called in Logger.ts
  }));
});
jest.mock('pino-pretty', () => jest.fn(), { virtual: true }); // Mock pino-pretty as virtual moduleConfig from their respective paths
import { Logger } from '../src/Logger';
import { Config } from '../src/Config';

// Mock the Config module
jest.mock('../src/Config', () => ({
  Config: {
    get: jest.fn(),
  },
}));

// Mock pino and pino-pretty
const mockPinoInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setBindings: jest.fn(), // Mock this method as it's called in Logger.ts
};
jest.mock('pino', () => jest.fn(() => mockPinoInstance));
jest.mock('pino-pretty', () => jest.fn(), { virtual: true }); // Mock pino-pretty as virtual module


describe('Logger', () => {
  let mockPinoInstance: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Default mock implementation for Config.get
    (Config.get as jest.Mock).mockReturnValue('info'); // Default log level
    
    // Get the mock pino instance for this test
    const pino = require('pino');
    mockPinoInstance = pino();
  });

  it('should initialize pino with default log level if LOG_LEVEL is not set', () => {
    require('../src/Logger'); // Re-require to trigger initialization
    expect(Config.get).toHaveBeenCalledWith('LOG_LEVEL', 'info');
    expect(require('pino')).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
    }));
  });

  it('should initialize pino with LOG_LEVEL from Config', () => {
    (Config.get as jest.Mock).mockReturnValue('debug');
    require('../src/Logger'); // Re-require
    expect(require('pino')).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
    }));
  });

  it('should call pino.info when Logger.info is called', () => {
    Logger.info('Test info message', { data: 'some data' });
    expect(mockPinoInstance.info).toHaveBeenCalledWith('Test info message', { data: 'some data' });
  });

  it('should call pino.warn when Logger.warn is called', () => {
    Logger.warn('Test warn message', { data: 'warning data' });
    expect(mockPinoInstance.warn).toHaveBeenCalledWith('Test warn message', { data: 'warning data' });
  });

  it('should call pino.error when Logger.error is called', () => {
    Logger.error('Test error message', new Error('test error'));
    expect(mockPinoInstance.error).toHaveBeenCalledWith('Test error message', new Error('test error'));
  });

  it('should call pino.debug when Logger.debug is called', () => {
    Logger.debug('Test debug message', { detail: 'debug details' });
    expect(mockPinoInstance.debug).toHaveBeenCalledWith('Test debug message', { detail: 'debug details' });
  });

  it('getInstance should return the pino instance', () => {
    const instance = Logger.getInstance();
    expect(instance).toBe(mockPinoInstance);
  });

  it('should attempt to use pino-pretty transport', () => {
    require('../src/Logger');
    expect(require('pino')).toHaveBeenCalledWith(expect.objectContaining({
      transport: expect.objectContaining({
        target: 'pino-pretty',
      }),
    }));
  });

  it('should fallback to default transport if pino-pretty is not found', () => {
    // Simulate pino-pretty not being found
    jest.doMock('pino-pretty', () => { throw new Error('Cannot find module'); });
    
    // We need to reset modules and re-require Logger for the new mock to take effect
    jest.resetModules();
    const FreshLogger = require('../src/Logger').Logger; // Get the Logger object
    const pino = require('pino'); // Get the pino module
    const freshMockInstance = pino();

    // Check if setBindings was called, indicating a fallback
    expect(pino).toHaveBeenCalled();
    expect(freshMockInstance.setBindings).toHaveBeenCalledWith({}); // Check if it attempts to reset transport
  });
});
