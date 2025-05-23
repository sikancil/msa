import pino from 'pino';
import { Config } from './Config';

const logLevel = Config.get<string>('LOG_LEVEL', 'info');

const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty', // Make logs more readable during development
    options: {
      colorize: true,
      ignore: 'pid,hostname', // Optional: hide pid and hostname
      translateTime: 'SYS:standard', // Use system's timezone for timestamps
    },
  },
});

// Check if pino-pretty is available, if not, use default transport
try {
  require.resolve('pino-pretty');
} catch (e) {
  console.warn("pino-pretty not found, using default JSON logger. Run 'npm install -D pino-pretty' in packages/core for prettier logs.");
  logger.setBindings({}); // Reset to default transport
}


export const Logger = {
  info: (message: string, ...args: any[]) => logger.info(message, ...args),
  warn: (message:string, ...args: any[]) => logger.warn(message, ...args),
  error: (message: string, ...args: any[]) => logger.error(message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
  // A method to get the raw pino instance if needed for advanced configuration
  getInstance: () => logger, 
};

export type LoggerType = typeof logger;
