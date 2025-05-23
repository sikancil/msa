import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import { Logger, Message, MessageHandler } from '@arifwidianto/msa-core';
import { RedisConfig } from './MessageBrokerPluginConfig';

export class RedisPubSubService {
  private publisher: RedisClientType;
  private subscriber: RedisClientType; // Redis requires separate clients for pub and sub operations when sub is active
  private config: RedisConfig;
  private logger: Logger;
  private messageHandlers: Map<string, MessageHandler[]> = new Map(); // channelName -> handlers
  private activeRedisSubscriptions: Map<string, boolean> = new Map(); // Tracks if a channel has an active Redis client subscription

  constructor(config: RedisConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;

    const clientOptions: RedisClientOptions = {
      url: config.url, // url takes precedence
      socket: config.url ? undefined : { host: config.host || 'localhost', port: config.port || 6379 },
      password: config.password,
    };

    this.publisher = createClient(clientOptions);
    this.subscriber = this.publisher.duplicate(); // Duplicate client for subscribing

    this.publisher.on('error', (err) => this.logger.error({ err }, 'Redis Publisher Error'));
    this.subscriber.on('error', (err) => this.logger.error({ err }, 'Redis Subscriber Error'));
  }

  async connect(): Promise<void> {
    try {
      await this.publisher.connect();
      await this.subscriber.connect();
      this.logger.info('Connected to Redis for Pub/Sub');
    } catch (error) {
      this.logger.error({ error }, 'Failed to connect to Redis');
      throw error;
    }
  }

  private getFullChannelName(channel: string): string {
    return `${this.config.defaultChannelPrefix || ''}${channel}`;
  }

  async publish(channel: string, message: Message): Promise<void> {
    if (!this.publisher.isOpen) {
        this.logger.error('Redis publisher not connected. Cannot publish.');
        throw new Error('Redis publisher not connected.');
    }
    const fullChannel = this.getFullChannelName(channel);
    const messageString = typeof message === 'object' ? JSON.stringify(message) : String(message);
    try {
        await this.publisher.publish(fullChannel, messageString);
        this.logger.debug({ channel: fullChannel }, 'Message published to Redis channel');
    } catch (error) {
        this.logger.error({ error, channel: fullChannel }, 'Error publishing message to Redis');
        throw error;
    }
  }

  async subscribe(channel: string, onMessageCallback: MessageHandler): Promise<string> {
    if (!this.subscriber.isOpen) {
        this.logger.error('Redis subscriber not connected. Cannot subscribe.');
        throw new Error('Redis subscriber not connected.');
    }
    const fullChannel = this.getFullChannelName(channel);

    if (!this.messageHandlers.has(fullChannel)) {
      this.messageHandlers.set(fullChannel, []);
    }
    this.messageHandlers.get(fullChannel)?.push(onMessageCallback);
    this.logger.info(`Handler added for Redis channel: ${fullChannel}. Total handlers: ${this.messageHandlers.get(fullChannel)?.length}`);

    // Subscribe with Redis client only if it's the first handler for this channel
    // and there's no active Redis subscription yet for this channel.
    if (!this.activeRedisSubscriptions.has(fullChannel)) {
      try {
        await this.subscriber.subscribe(fullChannel, (message, subscribedChannel) => {
          // Redis v4 message is always string. If it was JSON, it needs parsing.
          let parsedMessage: Message;
          try {
            // Attempt to parse if it looks like JSON, otherwise pass as string
            if (message.startsWith('{') && message.endsWith('}')) {
                 parsedMessage = JSON.parse(message);
            } else {
                 parsedMessage = message;
            }
          } catch (e) {
            parsedMessage = message; // If JSON.parse fails, treat as plain string
            this.logger.debug({ channel: subscribedChannel, error: e }, 'Failed to parse incoming message as JSON, treating as string.');
          }
          
          const handlers = this.messageHandlers.get(subscribedChannel);
          if (handlers) {
            this.logger.debug(`Delivering message from ${subscribedChannel} to ${handlers.length} handlers.`);
            handlers.forEach(handler => {
                try {
                    handler(parsedMessage);
                } catch (handlerError) {
                    this.logger.error({ error: handlerError, channel: subscribedChannel }, 'Error in Redis message handler');
                }
            });
          }
        });
        this.activeRedisSubscriptions.set(fullChannel, true);
        this.logger.info(`Successfully subscribed to Redis channel: ${fullChannel}`);
      } catch (error) {
          this.logger.error({ error, channel: fullChannel }, 'Error subscribing to Redis channel');
          // If subscription failed, remove the handler that was optimistically added.
          const handlers = this.messageHandlers.get(fullChannel);
          if (handlers) {
            const index = handlers.indexOf(onMessageCallback);
            if (index > -1) handlers.splice(index, 1);
            if (handlers.length === 0) this.messageHandlers.delete(fullChannel);
          }
          throw error;
      }
    }
    return fullChannel; // Use full channel name as subscriptionId for simplicity
  }

  async unsubscribe(channel: string, handlerToRemove?: MessageHandler): Promise<void> {
    if (!this.subscriber.isOpen && !handlerToRemove) { // Allow removing handlers even if not connected
        this.logger.warn('Redis subscriber not connected. Cannot unsubscribe from Redis channel itself, but will remove handlers.');
    }
    const fullChannel = this.getFullChannelName(channel);

    const handlers = this.messageHandlers.get(fullChannel);
    if (!handlers) {
        this.logger.warn(`No handlers found for Redis channel: ${fullChannel} to unsubscribe.`);
        return;
    }

    if (handlerToRemove) {
      const index = handlers.indexOf(handlerToRemove);
      if (index > -1) {
        handlers.splice(index, 1);
        this.logger.info(`Handler removed for Redis channel: ${fullChannel}`);
      }
      if (handlers.length === 0) {
        this.messageHandlers.delete(fullChannel);
      }
    } else { // Unsubscribe all handlers for this channel for this instance
      this.messageHandlers.delete(fullChannel);
      this.logger.info(`All handlers removed for Redis channel: ${fullChannel}`);
    }
    
    // If no more local handlers for this channel, and there was an active Redis subscription, unsubscribe from Redis
    if (!this.messageHandlers.has(fullChannel) && this.activeRedisSubscriptions.has(fullChannel)) {
      if (this.subscriber.isOpen) {
        try {
            await this.subscriber.unsubscribe(fullChannel);
            this.logger.info(`Successfully unsubscribed from Redis channel: ${fullChannel}`);
        } catch (error) {
            this.logger.error({ error, channel: fullChannel }, 'Error unsubscribing from Redis channel');
            // Even if unsubscribe fails, we mark it as inactive locally, as we have no more handlers.
        }
      } else {
          this.logger.warn(`Redis subscriber not connected, cannot send UNSUBSCRIBE for ${fullChannel}. Marking as inactive.`);
      }
      this.activeRedisSubscriptions.delete(fullChannel);
    }
  }

  async close(): Promise<void> {
    try {
      // Unsubscribe from all active Redis subscriptions first
      if (this.subscriber.isOpen) {
        const channelsToUnsubscribe = Array.from(this.activeRedisSubscriptions.keys());
        if (channelsToUnsubscribe.length > 0) {
            await this.subscriber.unsubscribe(channelsToUnsubscribe);
            this.logger.info(`Unsubscribed from all active Redis channels: ${channelsToUnsubscribe.join(', ')}`);
        }
        await this.subscriber.quit();
      }
    } catch (error) {
        this.logger.error({ error }, 'Error during Redis subscriber quit/unsubscribeAll.');
    } finally {
        this.activeRedisSubscriptions.clear();
        this.messageHandlers.clear(); // Clear all local handlers
    }

    try {
      if (this.publisher.isOpen) {
        await this.publisher.quit();
      }
    } catch (error) {
        this.logger.error({ error }, 'Error during Redis publisher quit.');
    }
    
    this.logger.info('Redis Pub/Sub connections closed.');
  }
}
