// Mock pino-pretty FIRST, as it's checked via require.resolve in Logger.ts
// Using { virtual: true } tells Jest to mock it even if it's not in node_modules.
jest.mock('pino-pretty', () => jest.fn(), { virtual: true });

// Import Logger AFTER mocking pino and pino-pretty
import { Logger } from '../Logger';

// Mock pino immediately after imports but before describe block
const mockPinoInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  setBindings: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

// Mock pino itself
jest.mock('pino', () => {
  const pinoConstructor = jest.fn(() => mockPinoInstance);
  return pinoConstructor;
});

describe('Logger', () => {
  beforeEach(() => {
    // Clear mock call counts before each test
    jest.clearAllMocks(); 
    // Note: jest.clearAllMocks() clears all mocks. Individual .mockClear() calls below are redundant.
    // Forcing them just in case there's a very subtle interaction.
    mockPinoInstance.info.mockClear();
    mockPinoInstance.warn.mockClear();
    mockPinoInstance.error.mockClear();
    mockPinoInstance.debug.mockClear();
    mockPinoInstance.setBindings.mockClear();
    mockPinoInstance.child.mockClear();
  });

  it('Logger.info should call pino.info', () => {
    Logger.info('Test info message', { data: 'some_data' });
    expect(mockPinoInstance.info).toHaveBeenCalledTimes(1);
    expect(mockPinoInstance.info).toHaveBeenCalledWith('Test info message', { data: 'some_data' });
  });

  it('Logger.warn should call pino.warn', () => {
    Logger.warn('Test warn message', { data: 'warn_data' });
    expect(mockPinoInstance.warn).toHaveBeenCalledTimes(1);
    expect(mockPinoInstance.warn).toHaveBeenCalledWith('Test warn message', { data: 'warn_data' });
  });

  it('Logger.error should call pino.error', () => {
    Logger.error('Test error message', { error: 'error_data' });
    expect(mockPinoInstance.error).toHaveBeenCalledTimes(1);
    expect(mockPinoInstance.error).toHaveBeenCalledWith('Test error message', { error: 'error_data' });
  });

  it('Logger.debug should call pino.debug', () => {
    Logger.debug('Test debug message', { data: 'debug_data' });
    expect(mockPinoInstance.debug).toHaveBeenCalledTimes(1);
    expect(mockPinoInstance.debug).toHaveBeenCalledWith('Test debug message', { data: 'debug_data' });
  });
  
  it('Logger.getInstance should return the pino instance', () => {
    const instance = Logger.getInstance();
    expect(instance).toBe(mockPinoInstance);
  });

  it('should attempt to set empty bindings if pino-pretty is not found', () => {
    // This test relies on the initial import of Logger in this test file (and its own module)
    // triggering the try-catch logic within Logger.ts.
    // If require.resolve('pino-pretty') fails (which it should in this test env),
    // logger.setBindings({}) should be called on our mockPinoInstance.
    expect(mockPinoInstance.setBindings).toHaveBeenCalledWith({});
  });
});
