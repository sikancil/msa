import * as amqp from 'amqplib';
import { Logger, Message, MessageHandler } from '@arifwidianto/msa-core';
import { RabbitMQConfig } from './MessageBrokerPluginConfig';

export class RabbitMQService {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private config: RabbitMQConfig;
  private logger: typeof Logger;
  private messageHandlers: Map<string, { handlers: MessageHandler[], consumerTag: string | null }> = new Map(); // queueName -> {handlers, consumerTag}


  constructor(config: RabbitMQConfig, logger: typeof Logger) {
    this.config = config;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.logger.info('Successfully connected to RabbitMQ server.');
      
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', { err });
        // Handle connection error, e.g., attempt reconnect or cleanup
        this.connection = null; // Mark as disconnected
        this.channel = null;
      });

      this.connection.on('close', (err) => {
        this.logger.info('RabbitMQ connection closed.', { err });
        this.connection = null; // Mark as disconnected
        this.channel = null;
        // Optionally attempt to reconnect here
      });
      
      this.channel = await this.connection.createChannel();
      this.logger.info('RabbitMQ channel created.');

      this.channel.on('error', (err) => {
        this.logger.error('RabbitMQ channel error', { err });
        this.channel = null; // Mark channel as unusable
      });

      this.channel.on('close', () => {
        this.logger.info('RabbitMQ channel closed.');
        this.channel = null;
      });

      if (this.config.defaultExchange) {
        await this.channel.assertExchange(
            this.config.defaultExchange.name, 
            this.config.defaultExchange.type || 'direct', 
            this.config.defaultExchange.options || { durable: true }
        );
        this.logger.info(`Default exchange "${this.config.defaultExchange.name}" asserted.`);
      }

      if (this.config.defaultQueue) {
         await this.channel.assertQueue(
            this.config.defaultQueue.name, 
            this.config.defaultQueue.options || { durable: true }
        );
        this.logger.info(`Default queue "${this.config.defaultQueue.name}" asserted.`);

         if(this.config.defaultExchange) { // Bind default queue to default exchange
            await this.channel.bindQueue(this.config.defaultQueue.name, this.config.defaultExchange.name, ''); // Empty routing key for default
            this.logger.info(`Default queue "${this.config.defaultQueue.name}" bound to default exchange "${this.config.defaultExchange.name}".`);
         }
      }
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ or setup defaults', { error });
      throw error;
    }
  }

  async publish(exchange: string, routingKey: string, content: Buffer | string | object, options?: amqp.Options.Publish): Promise<void> {
    if (!this.channel) {
        this.logger.error('RabbitMQ channel not available. Cannot publish message.');
        throw new Error('RabbitMQ channel not available.');
    }
    const bufferContent = Buffer.isBuffer(content) ? content : Buffer.from(typeof content === 'object' ? JSON.stringify(content) : content);
    
    try {
        // publish returns a boolean indicating if the message was enqueued (if not, means backpressure)
        const success = this.channel.publish(exchange, routingKey, bufferContent, options);
        if (success) {
            this.logger.debug('Message published to RabbitMQ.', { exchange, routingKey, options });
        } else {
            this.logger.warn('RabbitMQ publish buffer is full. Message was not published.', { exchange, routingKey, options });
            // Implement retry logic or backpressure handling if necessary
        }
    } catch (error) {
        this.logger.error('Error publishing message to RabbitMQ.', { error, exchange, routingKey });
        throw error;
    }
  }

  async subscribe(queueName: string, onMessageCallback: MessageHandler, options?: amqp.Options.Consume): Promise<string | null> {
    if (!this.channel) {
        this.logger.error('RabbitMQ channel not available. Cannot subscribe to queue.');
        throw new Error('RabbitMQ channel not available.');
    }
    
    const queueData = this.messageHandlers.get(queueName);

    if (queueData && queueData.handlers.length > 0) {
        // Already consuming on this queue, just add the handler
        queueData.handlers.push(onMessageCallback);
        this.logger.info(`Added new handler to existing subscription on queue: ${queueName}`);
        return queueData.consumerTag; // Return existing consumerTag
    }
    
    // New subscription for this queue
    await this.channel.assertQueue(queueName, this.config.defaultQueue?.options || { durable: true }); // Ensure queue exists
    
    const { consumerTag } = await this.channel.consume(queueName, (msg) => {
      if (msg) {
        const messageContent: Message = msg.content.toString(); // Or parse if JSON, e.g. JSON.parse(msg.content.toString())
        const currentQueueData = this.messageHandlers.get(queueName);
        if (currentQueueData) {
            currentQueueData.handlers.forEach(handler => {
                try {
                    handler(messageContent);
                } catch (handlerError) {
                    this.logger.error('Error in message handler for queue', { error: handlerError, queueName, messageId: msg.properties.messageId });
                    // Optionally, decide if message should be nack'd based on handler error
                }
            });
        }
        if (!(options && options.noAck)) { // Only ack if noAck is not true
            this.channel?.ack(msg); 
        }
      }
    }, options || { noAck: false }); // Default to manual ack

    this.messageHandlers.set(queueName, { handlers: [onMessageCallback], consumerTag });
    this.logger.info(`Subscribed to RabbitMQ queue: ${queueName} with consumerTag: ${consumerTag}`);
    return consumerTag;
  }
  
  async unsubscribe(queueName: string, specificHandler?: MessageHandler, consumerTagToCancel?: string): Promise<void> {
    if (!this.channel) {
        this.logger.warn('RabbitMQ channel not available. Cannot unsubscribe.');
        return;
    }

    const queueData = this.messageHandlers.get(queueName);
    if (!queueData) {
      this.logger.warn(`No active subscription found for queue: ${queueName} to unsubscribe from.`);
      return;
    }

    if (specificHandler) {
        const index = queueData.handlers.indexOf(specificHandler);
        if (index > -1) {
            queueData.handlers.splice(index, 1);
            this.logger.info(`Handler removed for queue: ${queueName}`);
        }
    } else {
        // If no specific handler, assume intent is to clear all handlers for this queue,
        // effectively stopping message processing for this instance, and cancel the consumer.
        queueData.handlers = [];
    }

    // If there are no more handlers for this queue, or if a consumerTag was explicitly passed for cancellation
    const resolvedConsumerTag = consumerTagToCancel || queueData.consumerTag;
    if ((queueData.handlers.length === 0 || consumerTagToCancel) && resolvedConsumerTag) {
      try {
        await this.channel.cancel(resolvedConsumerTag);
        this.logger.info(`Consumer (tag: ${resolvedConsumerTag}) cancelled for RabbitMQ queue: ${queueName}`);
        this.messageHandlers.delete(queueName); // Remove entry for queue
      } catch (error) {
        this.logger.error('Error cancelling RabbitMQ consumer', { error, queueName, consumerTag: resolvedConsumerTag });
        // Potentially, the consumerTag is invalid or channel is closed.
      }
    } else if (queueData.handlers.length > 0) {
        this.logger.info(`Subscription to queue ${queueName} still active as other handlers remain.`);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        // Attempt to cancel all active consumers managed by this service instance
        for (const [queueName, data] of this.messageHandlers) {
            if (data.consumerTag) {
                try {
                    await this.channel.cancel(data.consumerTag);
                    this.logger.info(`Consumer (tag: ${data.consumerTag}) cancelled for queue ${queueName} during close.`);
                } catch (cancelError) {
                    this.logger.error('Error cancelling consumer during close.', { error: cancelError, queueName, consumerTag: data.consumerTag });
                }
            }
        }
        this.messageHandlers.clear();

        await this.channel.close();
        this.logger.info('RabbitMQ channel closed.');
        this.channel = null;
      }
    } catch (error) {
        this.logger.error('Error closing RabbitMQ channel.', { error });
    }

    try {
      if (this.connection) {
        await this.connection.close();
        this.logger.info('RabbitMQ connection closed.');
        this.connection = null;
      }
    } catch (error) {
        this.logger.error('Error closing RabbitMQ connection.', { error });
    }
  }
}
