import { IPlugin, ITransport, Message, MessageHandler, IPluginDependency } from '@arifwidianto/msa-core'; // Service removed
import { MessageBrokerPluginConfig } from './MessageBrokerPluginConfig';
import { RabbitMQService } from './rabbitmq.service';
import { RedisPubSubService } from './redis.service';
import { Logger } from '@arifwidianto/msa-core';

export class MessageBrokerPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-messagebroker';
  public readonly version = '0.1.0';
  public readonly dependencies: IPluginDependency[] = [];
  
  private config!: MessageBrokerPluginConfig;
  private logger!: typeof Logger;
  private rabbitmqService?: RabbitMQService;
  private redisService?: RedisPubSubService;
  private defaultMessageHandler?: MessageHandler;

  // Store subscriptions for management
  private transportSubscriptions: Map<string, { 
    type: 'rabbitmq' | 'redis', 
    queueOrChannelName: string, 
    rabbitConsumerTag?: string, 
    specificHandler?: MessageHandler 
  }> = new Map();
  
  private nextSubscriptionId = 0;


  async initialize(config: MessageBrokerPluginConfig, _dependencies: Map<string, IPlugin>): Promise<void> {
    this.config = config;
    // Logger.debug(`Plugin ${this.name} received dependencies: ${Array.from(_dependencies.keys())}`);
    
    // Always use the global Logger since Service doesn't have getLogger method
    this.logger = Logger;
    this.logger.info(`${this.name}: Initializing message broker plugin with config: ${JSON.stringify(config)}`);
    

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
        this.logger.error(`${this.name}: Failed to connect RabbitMQService during start.`, { error });
        throw error;
      }
    }
    if (this.redisService) {
      try {
        await this.redisService.connect();
        this.logger.info('RedisPubSubService connected successfully.');
      } catch (error) {
        this.logger.error(`${this.name}: Failed to connect RedisPubSubService during start.`, { error });
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

  async listen(portOrTopic: number | string = "default"): Promise<void> {
    this.logger.info(`${this.name}: listen() called with port/path: ${portOrTopic}`);
    
    // For message brokers, we'll interpret the port/path parameter as the default topic/queue/channel
    // to listen on when onMessage is called without a specific topic
    const defaultTopic = String(portOrTopic) || 'default';
    
    if (this.config) {
      if (this.config.clientType === 'rabbitmq' && this.config.rabbitmq) {
        // Store this as the default queue to subscribe to
        this.config.rabbitmq.defaultQueue = this.config.rabbitmq.defaultQueue || { name: defaultTopic };
      } else if (this.config.clientType === 'redis' && this.config.redis) {
        // Store this as the default channel prefix
        this.config.redis.defaultChannelPrefix = defaultTopic;
      }
    }
    
    return Promise.resolve();
  }

  // Extension method specific to MessageBrokerPlugin - not part of ITransport interface
  async subscribeToTopic(topicName: string, handler: MessageHandler): Promise<string> {
    if (!handler) {
       this.logger.warn(`No handler provided for subscribe to topic: ${topicName}. Subscription not created.`);
       throw new Error(`Handler is required for subscription to topic: ${topicName}`);
    }
    
    const subscriptionId = `msa-sub-${this.nextSubscriptionId++}`;

    if (this.rabbitmqService) {
      try {
        const consumerTag = await this.rabbitmqService.subscribe(topicName, handler);
        if (consumerTag) {
            this.transportSubscriptions.set(subscriptionId, { 
              type: 'rabbitmq', 
              queueOrChannelName: topicName, 
              rabbitConsumerTag: consumerTag, 
              specificHandler: handler 
            });
            this.logger.info(`${this.name}: Subscribed to queue '${topicName}' with ID '${subscriptionId}' (tag: ${consumerTag})`);
            return subscriptionId;
        } else {
            // This might occur with a shared consumer
            this.transportSubscriptions.set(subscriptionId, { 
              type: 'rabbitmq', 
              queueOrChannelName: topicName, 
              specificHandler: handler 
            });
            this.logger.info(`${this.name}: Added handler to queue '${topicName}' with ID '${subscriptionId}'`);
            return subscriptionId;
        }
      } catch (error) {
        this.logger.error(`ITransport/RabbitMQ: Error subscribing to queue '${topicName}'.`, { error, queue: topicName });
        throw error;
      }
    } else if (this.redisService) {
      try {
        // RedisPubSubService.subscribe returns the full channel name, which we can use directly or wrap.
        // For consistency with ITransport, we'll use our generated subscriptionId.
        await this.redisService.subscribe(topicName, handler);
        this.transportSubscriptions.set(subscriptionId, { type: 'redis', queueOrChannelName: topicName, specificHandler: handler });
        this.logger.info(`ITransport/Redis: Subscribed to channel '${topicName}' with subscriptionId '${subscriptionId}'.`);
        return subscriptionId;
      } catch (error) {
        this.logger.error(`ITransport/Redis: Error subscribing to channel '${topicName}'.`, { error, channel: topicName });
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
        this.listen(targetTopicOrQueue).catch(err => {
            this.logger.error(`ITransport.onMessage: Error setting up listener.`, {err, topicOrQueue: targetTopicOrQueue});

            this.subscribeToTopic(targetTopicOrQueue, handler).then(subscriptionId => {
                this.logger.info(`ITransport.onMessage: Listening for messages on topic/queue '${targetTopicOrQueue}' with subscriptionId '${subscriptionId}'.`);
            }).catch(err => {
                this.logger.error(`ITransport.onMessage: Error subscribing to topic/queue '${targetTopicOrQueue}'.`, { err });
            });
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
