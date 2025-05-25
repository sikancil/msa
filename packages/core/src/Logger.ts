import pino from 'pino';
import { Config } from './Config';

const logLevel = Config.get<string>('LOG_LEVEL', 'info');

const pinoOptions: pino.LoggerOptions = {
  level: logLevel,
};

if (process.env.NODE_ENV !== 'production') {
  try {
    require.resolve('pino-pretty'); // Check if available
    pinoOptions.transport = { 
      target: 'pino-pretty', 
      options: { 
        colorize: true, 
        ignore: 'pid,hostname', 
        translateTime: 'SYS:standard' 
      } 
    };
  } catch (err) {
    // pino-pretty not installed, or NODE_ENV is production (though already checked)
    console.warn("pino-pretty not found, using default JSON logger. For dev, run 'npm install -D pino-pretty' in packages/core.");
  }
}

const logger = pino(pinoOptions);

export const Logger = {
  info: (message: string, ...args: any[]) => logger.info(message, ...args),
  warn: (message:string, ...args: any[]) => logger.warn(message, ...args),
  error: (message: string, ...args: any[]) => logger.error(message, ...args),
  debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
  // A method to get the raw pino instance if needed for advanced configuration
  getInstance: () => logger, 
};

export type LoggerType = typeof logger;
