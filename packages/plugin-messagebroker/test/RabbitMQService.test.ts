import { RabbitMQService } from '../src/rabbitmq.service';
import { RabbitMQConfig } from '../src/MessageBrokerPluginConfig';
import { Logger, MessageHandler } from '@arifwidianto/msa-core';
import amqp from 'amqplib';

// Mock Logger from @arifwidianto/msa-core
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const MockLogger = mockLoggerInstance as unknown as typeof Logger;

// Mock amqplib
const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue(undefined),
  assertQueue: jest.fn().mockResolvedValue(undefined),
  bindQueue: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockReturnValue(true), // Simulate successful publish
  consume: jest.fn().mockResolvedValue({ consumerTag: 'test-consumer-tag' }),
  ack: jest.fn(),
  cancel: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(), // For 'error' and 'close' events on channel
};
const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(), // For 'error' and 'close' events on connection
};
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  const config: RabbitMQConfig = {
    url: 'amqp://localhost',
    defaultExchange: { name: 'test-exchange', type: 'direct' },
    defaultQueue: { name: 'test-queue' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RabbitMQService(config, MockLogger);
  });

  describe('connect', () => {
    it('should connect to RabbitMQ, create channel, and assert defaults', async () => {
      await service.connect();
      expect(amqp.connect).toHaveBeenCalledWith(config.url);
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(config.defaultExchange!.name, config.defaultExchange!.type, { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(config.defaultQueue!.name, { durable: true });
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(config.defaultQueue!.name, config.defaultExchange!.name, '');
      expect(MockLogger.info).toHaveBeenCalledWith('Successfully connected to RabbitMQ server.');
      expect(MockLogger.info).toHaveBeenCalledWith('RabbitMQ channel created.');
    });

    it('should handle connection error', async () => {
      const error = new Error('Connection failed');
      (amqp.connect as jest.Mock).mockRejectedValueOnce(error);
      await expect(service.connect()).rejects.toThrow(error);
      expect(MockLogger.error).toHaveBeenCalledWith({ error }, 'Failed to connect to RabbitMQ or setup defaults');
    });
    
    it('should register event listeners for connection and channel', async () => {
        await service.connect();
        expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
        expect(mockChannel.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(mockChannel.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      await service.connect(); // Ensure channel is available
    });

    it('should publish a message', async () => {
      const content = { data: 'test message' };
      await service.publish('test-exchange', 'test-key', content);
      expect(mockChannel.publish).toHaveBeenCalledWith(
        'test-exchange',
        'test-key',
        Buffer.from(JSON.stringify(content)),
        undefined // options
      );
      expect(MockLogger.debug).toHaveBeenCalledWith({ exchange: 'test-exchange', routingKey: 'test-key', options: undefined }, 'Message published to RabbitMQ.');
    });

    it('should throw error if channel is not available', async () => {
      await service.close(); // Close connection and channel
      await expect(service.publish('ex', 'rk', 'msg')).rejects.toThrow('RabbitMQ channel not available.');
    });
    
    it('should warn if publish buffer is full', async () => {
        (mockChannel.publish as jest.Mock).mockReturnValueOnce(false); // Simulate buffer full
        await service.publish('ex', 'rk', 'msg');
        expect(MockLogger.warn).toHaveBeenCalledWith({ exchange: 'ex', routingKey: 'rk', options: undefined }, 'RabbitMQ publish buffer is full. Message was not published.');
    });
  });

  describe('subscribe and unsubscribe', () => {
    let handler: jest.Mock<MessageHandler>;
    const queueName = 'my-queue';

    beforeEach(async () => {
      await service.connect();
      handler = jest.fn();
    });

    it('should subscribe to a queue and process messages', async () => {
      const consumerTag = await service.subscribe(queueName, handler);
      expect(consumerTag).toBe('test-consumer-tag');
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(queueName, { durable: true });
      expect(mockChannel.consume).toHaveBeenCalledWith(queueName, expect.any(Function), { noAck: false });
      expect(MockLogger.info).toHaveBeenCalledWith(`Subscribed to RabbitMQ queue: ${queueName} with consumerTag: ${consumerTag}`);

      // Simulate receiving a message
      const consumeCallback = (mockChannel.consume as jest.Mock).mock.calls[0][1];
      const testMessage = { content: Buffer.from('hello world'), properties: { messageId: "msg123"} };
      consumeCallback(testMessage);

      expect(handler).toHaveBeenCalledWith('hello world');
      expect(mockChannel.ack).toHaveBeenCalledWith(testMessage);
    });

    it('should add multiple handlers to the same queue and use existing consumer', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        const consumerTag1 = await service.subscribe(queueName, handler1);
        expect(consumerTag1).toBe('test-consumer-tag'); // First handler creates consumer

        const consumerTag2 = await service.subscribe(queueName, handler2);
        expect(consumerTag2).toBe('test-consumer-tag'); // Second handler uses existing consumer for the queue

        expect(mockChannel.consume).toHaveBeenCalledTimes(1); // consume only called once for the queue
        expect(MockLogger.info).toHaveBeenCalledWith(`Added new handler to existing subscription on queue: ${queueName}`);

        // Simulate message, both handlers should be called
        const consumeCallback = (mockChannel.consume as jest.Mock).mock.calls[0][1];
        const testMessage = { content: Buffer.from('shared message'), properties: { messageId: "msgShared"} };
        consumeCallback(testMessage);
        expect(handler1).toHaveBeenCalledWith('shared message');
        expect(handler2).toHaveBeenCalledWith('shared message');
        expect(mockChannel.ack).toHaveBeenCalledWith(testMessage);
    });

    it('should unsubscribe a specific handler and then the consumer if no handlers left', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        const consumerTag = await service.subscribe(queueName, handler1);
        await service.subscribe(queueName, handler2); // Adds handler2

        // Unsubscribe handler1
        await service.unsubscribe(queueName, handler1, consumerTag!);
        expect(MockLogger.info).toHaveBeenCalledWith(`Handler removed for queue: ${queueName}`);
        // @ts-ignore
        expect(service['messageHandlers'].get(queueName)?.handlers.includes(handler1)).toBe(false);
        // @ts-ignore
        expect(service['messageHandlers'].get(queueName)?.handlers.includes(handler2)).toBe(true);
        expect(mockChannel.cancel).not.toHaveBeenCalled(); // Consumer still active for handler2

        // Unsubscribe handler2 (last one for this consumerTag)
        await service.unsubscribe(queueName, handler2, consumerTag!);
        expect(MockLogger.info).toHaveBeenCalledWith(`Handler removed for queue: ${queueName}`); // Handler removed log
        expect(mockChannel.cancel).toHaveBeenCalledWith(consumerTag);
        expect(MockLogger.info).toHaveBeenCalledWith(`Consumer (tag: ${consumerTag}) cancelled for RabbitMQ queue: ${queueName}`);
        // @ts-ignore
        expect(service['messageHandlers'].has(queueName)).toBe(false);
    });

    it('should throw error if channel not available on subscribe', async () => {
      await service.close();
      await expect(service.subscribe(queueName, handler)).rejects.toThrow('RabbitMQ channel not available.');
    });
  });

  describe('close', () => {
    it('should close channel and connection, and cancel consumers', async () => {
      await service.connect();
      // Simulate an active subscription to test consumer cancellation
      const handler = jest.fn();
      const queueName = 'another-queue';
      const consumerTag = await service.subscribe(queueName, handler);

      await service.close();

      expect(mockChannel.cancel).toHaveBeenCalledWith(consumerTag); // Ensure consumer is cancelled
      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
      expect(MockLogger.info).toHaveBeenCalledWith('RabbitMQ channel closed.');
      expect(MockLogger.info).toHaveBeenCalledWith('RabbitMQ connection closed.');
    });
  });
});
