import { Config } from '../src/Config';

describe('Config', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  it('should get a value from environment variables', () => {
    process.env.TEST_KEY = 'test_value';
    expect(Config.get('TEST_KEY')).toBe('test_value');
  });

  it('should return default value if environment variable is not set', () => {
    expect(Config.get('UNDEFINED_KEY', 'default')).toBe('default');
  });

  it('should return undefined if environment variable is not set and no default is provided', () => {
    expect(Config.get('UNDEFINED_KEY_NO_DEFAULT')).toBeUndefined();
  });

  it('should parse boolean true string from environment variables', () => {
    process.env.BOOL_KEY_TRUE = 'true';
    expect(Config.get('BOOL_KEY_TRUE')).toBe(true);
  });

  it('should parse boolean false string from environment variables', () => {
    process.env.BOOL_KEY_FALSE = 'false';
    expect(Config.get('BOOL_KEY_FALSE')).toBe(false);
  });

  it('should parse numeric string from environment variables', () => {
    process.env.NUM_KEY = '123.45';
    expect(Config.get('NUM_KEY')).toBe(123.45);
  });

  it('should return string if it looks like a number but is not perfectly parsed', () => {
    process.env.STRING_NUM_KEY = '123.45abc';
    expect(Config.get('STRING_NUM_KEY')).toBe('123.45abc');
  });

  it('should prioritize environment variable over default value', () => {
    process.env.PRIORITY_KEY = 'env_value';
    expect(Config.get('PRIORITY_KEY', 'default_value')).toBe('env_value');
  });

  it('should handle empty string from environment variables', () => {
    process.env.EMPTY_STRING_KEY = '';
    expect(Config.get('EMPTY_STRING_KEY', 'default_value')).toBe('');
  });
});
