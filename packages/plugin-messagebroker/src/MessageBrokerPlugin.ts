import { IPlugin, ITransport, Logger, Service, Message, MessageHandler, PluginConfig } from '@arifwidianto/msa-core';
import { MessageBrokerPluginConfig, RabbitMQConfig, RedisConfig } from './MessageBrokerPluginConfig'; // Import RedisConfig
import { RabbitMQService } from './rabbitmq.service';
import { RedisPubSubService } from './redis.service'; // Import RedisPubSubService

export class MessageBrokerPlugin implements IPlugin, ITransport {
  name = 'msa-plugin-messagebroker';
  version = '0.1.0';
  dependencies: string[] = [];
  
  private config!: MessageBrokerPluginConfig;
  private logger!: Logger;
  private rabbitmqService?: RabbitMQService;
  private redisService?: RedisPubSubService;

  // Store consumerTags/subscriptionIds to manage subscriptions via ITransport methods
  // For RabbitMQ, value is { queueName, consumerTag }
  // For Redis, value is { channelName, isRedis: true } (consumerTag concept doesn't directly map)
  private transportSubscriptions: Map<string, { type: 'rabbitmq' | 'redis', queueOrChannelName: string, rabbitConsumerTag?: string, specificHandler?: MessageHandler }> = new Map();
  private nextSubscriptionId = 0;


  async initialize(config: MessageBrokerPluginConfig, service?: Service): Promise<void> {
    this.config = config;
    
    if (service && typeof service.getLogger === 'function') {
      this.logger = service.getLogger(this.name);
    } else {
      this.logger = Logger; 
      this.logger.warn(`${this.name}: Service instance or getLogger method not provided to initialize. Using global Logger.`);
    }

    if (config.clientType === 'rabbitmq' && config.rabbitmq) {
      this.logger.info('RabbitMQ client type configured. Initializing RabbitMQService.');
      this.rabbitmqService = new RabbitMQService(config.rabbitmq, this.logger);
    } else if (config.clientType === 'redis' && config.redis) {
      this.logger.info('Redis client type configured. Initializing RedisPubSubService.');
      this.redisService = new RedisPubSubService(config.redis, this.logger);
    } else {
      this.logger.warn('Message broker clientType not configured properly or unknown.');
    }
  }

  async start(): Promise<void> {
    this.logger.info(`${this.name} starting...`);
    if (this.rabbitmqService) {
      try {
        await this.rabbitmqService.connect();
        this.logger.info('RabbitMQService connected successfully.');
      } catch (error) {
        this.logger.error({ error }, `${this.name}: Failed to connect RabbitMQService during start.`);
        throw error;
      }
    }
    if (this.redisService) {
      try {
        await this.redisService.connect();
        this.logger.info('RedisPubSubService connected successfully.');
      } catch (error) {
        this.logger.error({ error }, `${this.name}: Failed to connect RedisPubSubService during start.`);
        throw error;
      }
    }
  }

  async stop(): Promise<void> {
    this.logger.info(`${this.name} stopping...`);
    if (this.rabbitmqService) {
      await this.rabbitmqService.close();
      this.logger.info('RabbitMQService connection closed.');
    }
    if (this.redisService) {
      await this.redisService.close();
      this.logger.info('RedisPubSubService connection closed.');
    }
  }
  
  async cleanup(): Promise<void> {
    this.logger.info(`${this.name} cleaning up...`);
    if (this.rabbitmqService) {
      await this.rabbitmqService.close();
      this.rabbitmqService = undefined;
    }
    if (this.redisService) {
      await this.redisService.close();
      this.redisService = undefined;
    }
    this.transportSubscriptions.clear();
    this.logger.info(`${this.name} cleanup complete.`);
  }

  // --- ITransport implementation ---

  async listen(topicOrQueueName: string, handler?: MessageHandler): Promise<string | void> {
    if (!handler) {
       this.logger.warn(`No handler provided for listen/subscribe on: ${topicOrQueueName}. Subscription not created.`);
       return;
    }
    
    const subscriptionId = `msa-sub-${this.nextSubscriptionId++}`;

    if (this.rabbitmqService) {
      try {
        const consumerTag = await this.rabbitmqService.subscribe(topicOrQueueName, handler);
        if (consumerTag) {
            this.transportSubscriptions.set(subscriptionId, { type: 'rabbitmq', queueOrChannelName: topicOrQueueName, rabbitConsumerTag: consumerTag, specificHandler: handler });
            this.logger.info(`ITransport/RabbitMQ: Subscribed to queue '${topicOrQueueName}' with subscriptionId '${subscriptionId}' (consumerTag: ${consumerTag}).`);
            return subscriptionId;
        } else {
            // This branch might occur if RabbitMQService's subscribe decides not to return a new consumerTag (e.g. shared consumer)
            // For ITransport, we still want a unique ID to manage this specific handler.
            this.transportSubscriptions.set(subscriptionId, { type: 'rabbitmq', queueOrChannelName: topicOrQueueName, specificHandler: handler });
            this.logger.info(`ITransport/RabbitMQ: Added handler to queue '${topicOrQueueName}' with subscriptionId '${subscriptionId}' (likely shared consumer).`);
            return subscriptionId;
        }
      } catch (error) {
        this.logger.error({ error, queue: topicOrQueueName }, `ITransport/RabbitMQ: Error subscribing to queue '${topicOrQueueName}'.`);
        throw error;
      }
    } else if (this.redisService) {
      try {
        // RedisPubSubService.subscribe returns the full channel name, which we can use directly or wrap.
        // For consistency with ITransport, we'll use our generated subscriptionId.
        await this.redisService.subscribe(topicOrQueueName, handler);
        this.transportSubscriptions.set(subscriptionId, { type: 'redis', queueOrChannelName: topicOrQueueName, specificHandler: handler });
        this.logger.info(`ITransport/Redis: Subscribed to channel '${topicOrQueueName}' with subscriptionId '${subscriptionId}'.`);
        return subscriptionId;
      } catch (error) {
        this.logger.error({ error, channel: topicOrQueueName }, `ITransport/Redis: Error subscribing to channel '${topicOrQueueName}'.`);
        throw error;
      }
    } else {
      this.logger.error('ITransport: No message broker service (RabbitMQ/Redis) available. Cannot subscribe.');
      throw new Error('No message broker service available for listen/subscribe.');
    }
  }

  async send(message: Message, topicOrRoutingKey?: string, exchange?: string): Promise<void> {
    if (this.rabbitmqService) {
      const targetExchange = exchange || this.config.rabbitmq?.defaultExchange?.name || '';
      const targetRoutingKey = topicOrRoutingKey || '';
      await this.rabbitmqService.publish(targetExchange, targetRoutingKey, message);
      this.logger.debug(`ITransport/RabbitMQ: Message sent to exchange '${targetExchange}' with routingKey '${targetRoutingKey}'.`);
    } else if (this.redisService) {
      if (!topicOrRoutingKey) {
        this.logger.error('ITransport/Redis: Redis publish requires a channel name (passed as topicOrRoutingKey).');
        throw new Error('Redis publish requires a channel name.');
      }
      await this.redisService.publish(topicOrRoutingKey, message);
      this.logger.debug(`ITransport/Redis: Message sent to channel '${topicOrRoutingKey}'.`);
    } else {
      this.logger.error('ITransport: No message broker service available. Cannot send message.');
      throw new Error('No message broker service available for send.');
    }
  }
  
  onMessage(handler: MessageHandler, topicOrQueueName?: string): void {
     const targetTopicOrQueue = topicOrQueueName || 
        (this.config.clientType === 'rabbitmq' ? this.config.rabbitmq?.defaultQueue?.name : undefined) ||
        (this.config.clientType === 'redis' ? (this.redisService ? this.redisService['getFullChannelName']('default') : 'default') : undefined);
        // Note: Accessing private getFullChannelName is a bit of a hack for default; consider public default channel name property in RedisService.

     if (targetTopicOrQueue) {
        this.listen(targetTopicOrQueue, handler).catch(err => {
            this.logger.error({err, topicOrQueue: targetTopicOrQueue}, `ITransport.onMessage: Error setting up listener.`);
        });
     } else {
        this.logger.error('ITransport.onMessage: Cannot call onMessage without a topic/queueName or default configured for the active client type.');
     }
  }

  async close(subscriptionId?: string): Promise<void> {
    if (subscriptionId) {
      const subInfo = this.transportSubscriptions.get(subscriptionId);
      if (!subInfo) {
        this.logger.warn(`ITransport.close: No active subscription found for ID '${subscriptionId}'. No action taken.`);
        return;
      }

      if (subInfo.type === 'rabbitmq' && this.rabbitmqService) {
        // RabbitMQService.unsubscribe can take specific handler or consumerTag
        await this.rabbitmqService.unsubscribe(subInfo.queueOrChannelName, subInfo.specificHandler, subInfo.rabbitConsumerTag);
        this.logger.info(`ITransport/RabbitMQ: Unsubscribed from queue '${subInfo.queueOrChannelName}' for subscriptionId '${subscriptionId}'.`);
      } else if (subInfo.type === 'redis' && this.redisService) {
        // RedisPubSubService.unsubscribe takes channelName and optional specific handler
        await this.redisService.unsubscribe(subInfo.queueOrChannelName, subInfo.specificHandler);
        this.logger.info(`ITransport/Redis: Unsubscribed from channel '${subInfo.queueOrChannelName}' for subscriptionId '${subscriptionId}'.`);
      }
      this.transportSubscriptions.delete(subscriptionId);
    } else {
      // General close: shut down the entire connection for the active broker.
      this.logger.info('ITransport.close: No specific subscriptionId provided. Closing entire message broker connection for this plugin.');
      if (this.rabbitmqService) await this.rabbitmqService.close();
      if (this.redisService) await this.redisService.close();
      this.transportSubscriptions.clear();
    }
  }
}
