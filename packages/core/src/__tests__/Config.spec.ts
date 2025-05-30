import { Config } from '../Config';

describe('Config', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...ORIGINAL_ENV }; // Make a copy
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV; // Restore old environment
  });

  it('should retrieve an existing environment variable', () => {
    process.env.TEST_VAR = 'test_value';
    expect(Config.get('TEST_VAR')).toBe('test_value');
  });

  it('should return defaultValue if environment variable does not exist', () => {
    expect(Config.get('NON_EXISTENT_VAR', 'default_value')).toBe('default_value');
  });

  it('should return undefined if environment variable does not exist and no defaultValue is provided', () => {
    expect(Config.get('NON_EXISTENT_VAR_NO_DEFAULT')).toBeUndefined();
  });

  it('should parse boolean true environment variables', () => {
    process.env.BOOL_TRUE_VAR = 'true';
    expect(Config.get('BOOL_TRUE_VAR')).toBe(true);
    process.env.BOOL_UPPER_TRUE_VAR = 'TRUE';
    expect(Config.get('BOOL_UPPER_TRUE_VAR')).toBe(true);
  });

  it('should parse boolean false environment variables', () => {
    process.env.BOOL_FALSE_VAR = 'false';
    expect(Config.get('BOOL_FALSE_VAR')).toBe(false);
    process.env.BOOL_UPPER_FALSE_VAR = 'FALSE';
    expect(Config.get('BOOL_UPPER_FALSE_VAR')).toBe(false);
  });

  it('should parse numeric environment variables', () => {
    process.env.NUM_VAR = '123';
    expect(Config.get('NUM_VAR')).toBe(123);
    process.env.FLOAT_VAR = '123.45';
    expect(Config.get('FLOAT_VAR')).toBe(123.45);
  });

  it('should return string if it looks numeric but is not strictly so (e.g., leading zeros for codes)', () => {
    process.env.NUM_STRING_VAR = '007';
    expect(Config.get('NUM_STRING_VAR')).toBe('007'); // Default behavior of parseFloat might differ, good to ensure it's string if not strictly number
  });
  
  it('should return string for non-boolean/non-numeric-looking strings', () => {
    process.env.TEXT_VAR = 'hello world';
    expect(Config.get('TEXT_VAR')).toBe('hello world');
  });

  it('should use defaultValue for boolean if variable is not set', () => {
    expect(Config.get('UNSET_BOOL_VAR', true)).toBe(true);
    expect(Config.get('UNSET_BOOL_VAR_2', false)).toBe(false);
  });

  it('should use defaultValue for number if variable is not set', () => {
    expect(Config.get('UNSET_NUM_VAR', 999)).toBe(999);
  });
});
