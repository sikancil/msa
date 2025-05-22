export class Config {
  /**
   * Retrieves a configuration value.
   * It first checks environment variables, then falls back to a default value if provided.
   * 
   * Example: `Config.get('LOG_LEVEL', 'info')`
   * 
   * @param key The configuration key. Environment variables are typically uppercase with underscores.
   * @param defaultValue Optional default value if the key is not found in environment variables.
   * @returns The configuration value or the default value.
   */
  public static get<T = any>(key: string, defaultValue?: T): T {
    const value = process.env[key];
    if (value !== undefined) {
      // Attempt to parse if it looks like a boolean or number
      if (value.toLowerCase() === 'true') {
        return true as any as T;
      }
      if (value.toLowerCase() === 'false') {
        return false as any as T;
      }
      const num = parseFloat(value);
      if (!isNaN(num) && num.toString() === value) {
        return num as any as T;
      }
      return value as any as T;
    }
    return defaultValue as T;
  }
}
