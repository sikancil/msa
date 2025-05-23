import { MessageBrokerPlugin, MessageBrokerPluginConfig, RabbitMQConfig, RedisConfig } from '../src';
import { RabbitMQService } from '../src/rabbitmq.service';
import { RedisPubSubService } from '../src/redis.service';
import { Logger, Service, Message, MessageHandler } from '@arifwidianto/msa-core';

// Mock Logger
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock Service
const mockServiceInstance = {
  getLogger: jest.fn(() => mockLoggerInstance as unknown as Logger),
  // Add other Service methods if your plugin uses them
};

// Mock RabbitMQService
const mockRabbitMQServiceInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue('mock-consumer-tag'),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../src/rabbitmq.service', () => ({
  RabbitMQService: jest.fn(() => mockRabbitMQServiceInstance),
}));

// Mock RedisPubSubService
const mockRedisPubSubServiceInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue('mock-redis-channel'),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../src/redis.service', () => ({
  RedisPubSubService: jest.fn(() => mockRedisPubSubServiceInstance),
}));


describe('MessageBrokerPlugin', () => {
  let plugin: MessageBrokerPlugin;
  const rabbitmqConfig: RabbitMQConfig = { url: 'amqp://test' };
  const redisConfig: RedisConfig = { url: 'redis://test', defaultChannelPrefix: 'msa:' };
  
  const rabbitmqPluginConfig: MessageBrokerPluginConfig = {
    clientType: 'rabbitmq',
    rabbitmq: rabbitmqConfig,
  };
  const redisPluginConfig: MessageBrokerPluginConfig = {
    clientType: 'redis',
    redis: redisConfig,
  };


  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new MessageBrokerPlugin();
  });

  describe('Initialization', () => {
    it('should initialize RabbitMQService if clientType is rabbitmq', async () => {
      await plugin.initialize(rabbitmqPluginConfig, mockServiceInstance as unknown as Service);
      expect(mockServiceInstance.getLogger).toHaveBeenCalledWith(plugin.name);
      expect(RabbitMQService).toHaveBeenCalledWith(rabbitmqConfig, mockLoggerInstance);
      expect(plugin['rabbitmqService']).toBe(mockRabbitMQServiceInstance);
      expect(plugin['redisService']).toBeUndefined();
    });

    it('should initialize RedisPubSubService if clientType is redis', async () => {
      await plugin.initialize(redisPluginConfig, mockServiceInstance as unknown as Service);
      expect(mockServiceInstance.getLogger).toHaveBeenCalledWith(plugin.name);
      expect(RedisPubSubService).toHaveBeenCalledWith(redisConfig, mockLoggerInstance);
      expect(plugin['redisService']).toBe(mockRedisPubSubServiceInstance);
      expect(plugin['rabbitmqService']).toBeUndefined();
    });

    it('should warn if clientType is not configured or unknown', async () => {
      const wrongConfig = { clientType: 'unknown' } as any;
      await plugin.initialize(wrongConfig, mockServiceInstance as unknown as Service);
      expect(mockLoggerInstance.warn).toHaveBeenCalledWith('Message broker clientType not configured properly or unknown.');
    });
  });

  describe('Lifecycle Methods (start, stop) - RabbitMQ', () => {
    beforeEach(async () => {
      await plugin.initialize(rabbitmqPluginConfig, mockServiceInstance as unknown as Service);
    });

    it('start() should call connect on RabbitMQService', async () => {
      await plugin.start();
      expect(mockRabbitMQServiceInstance.connect).toHaveBeenCalled();
    });

    it('stop() should call close on RabbitMQService', async () => {
      await plugin.stop();
      expect(mockRabbitMQServiceInstance.close).toHaveBeenCalled();
    });
  });
  
  describe('Lifecycle Methods (start, stop) - Redis', () => {
    let mockRedisServiceInstance: any; // To store the instance created by the mock

    beforeEach(async () => {
      // Setup RedisPubSubService mock for these tests
      // This ensures that when RedisPubSubService is newed up by the plugin, our mock instance is used.
      (RedisPubSubService as jest.Mock).mockImplementation(() => mockRedisPubSubServiceInstance);
      
      await plugin.initialize(redisPluginConfig, mockServiceInstance as unknown as Service);
    });

    it('start() should call connect on RedisPubSubService', async () => {
      await plugin.start();
      expect(mockRedisPubSubServiceInstance.connect).toHaveBeenCalled();
    });

    it('stop() should call close on RedisPubSubService', async () => {
      await plugin.stop();
      expect(mockRedisPubSubServiceInstance.close).toHaveBeenCalled();
    });
  });


  describe('ITransport Implementation - RabbitMQ', () => {
    const testQueue = 'test-q';
    const testMessage: Message = 'hello there';
    let handler: jest.Mock<MessageHandler>;

    beforeEach(async () => {
      await plugin.initialize(rabbitmqPluginConfig, mockServiceInstance as unknown as Service);
      handler = jest.fn();
    });

    it('listen() should call RabbitMQService.subscribe', async () => {
      await plugin.listen(testQueue, handler);
      expect(mockRabbitMQServiceInstance.subscribe).toHaveBeenCalledWith(testQueue, handler);
    });

    it('send() should call RabbitMQService.publish', async () => {
      await plugin.send(testMessage, 'rk', 'ex');
      expect(mockRabbitMQServiceInstance.publish).toHaveBeenCalledWith('ex', 'rk', testMessage);
    });
    
    it('close() without args should call RabbitMQService.close', async () => {
        await plugin.close();
        expect(mockRabbitMQServiceInstance.close).toHaveBeenCalled();
    });

    it('close() with subscriptionId should call RabbitMQService.unsubscribe', async () => {
        const subId = 'sub-id-for-rabbitmq';
        // @ts-ignore
        plugin['transportSubscriptions'].set(subId, { type: 'rabbitmq', queueOrChannelName: testQueue, rabbitConsumerTag: 'tag1', specificHandler: handler });
        await plugin.close(subId);
        expect(mockRabbitMQServiceInstance.unsubscribe).toHaveBeenCalledWith(testQueue, handler, 'tag1');
    });
  });

  describe('ITransport Implementation - Redis', () => {
    const testChannel = 'test-chan';
    const testMessage: Message = 'redis message';
    let handler: jest.Mock<MessageHandler>;
    let handler: jest.Mock<MessageHandler>;

    beforeEach(async () => {
      // Ensure RedisPubSubService is mocked for each test in this describe block if plugin is re-initialized
      (RedisPubSubService as jest.Mock).mockImplementation(() => mockRedisPubSubServiceInstance);
      await plugin.initialize(redisPluginConfig, mockServiceInstance as unknown as Service);
      handler = jest.fn();
    });

    it('listen() should call RedisPubSubService.subscribe', async () => {
      await plugin.listen(testChannel, handler);
      expect(mockRedisPubSubServiceInstance.subscribe).toHaveBeenCalledWith(testChannel, handler);
    });

    it('send() should call RedisPubSubService.publish', async () => {
      await plugin.send(testMessage, testChannel); // For Redis, topicOrRoutingKey is the channel
      expect(mockRedisPubSubServiceInstance.publish).toHaveBeenCalledWith(testChannel, testMessage);
    });
    
    it('send() should throw error if topicOrRoutingKey (channel) is missing for Redis', async () => {
        await expect(plugin.send(testMessage)).rejects.toThrow('Redis publish requires a channel name.');
    });
    
    it('close() without args should call RedisPubSubService.close', async () => {
        await plugin.close();
        expect(mockRedisPubSubServiceInstance.close).toHaveBeenCalled();
    });

    it('close() with subscriptionId should call RedisPubSubService.unsubscribe', async () => {
        const subId = 'sub-id-for-redis';
        // @ts-ignore
        plugin['transportSubscriptions'].set(subId, { type: 'redis', queueOrChannelName: testChannel, specificHandler: handler });
        await plugin.close(subId);
        expect(mockRedisPubSubServiceInstance.unsubscribe).toHaveBeenCalledWith(testChannel, handler);
    });
  });
  
  describe('Cleanup', () => {
    it('should close and undefine RabbitMQService', async () => {
        await plugin.initialize(rabbitmqPluginConfig, mockServiceInstance as unknown as Service);
        await plugin.cleanup();
        expect(mockRabbitMQServiceInstance.close).toHaveBeenCalled();
        expect(plugin['rabbitmqService']).toBeUndefined();
    });
    
    it('should close and undefine RedisPubSubService', async () => {
        (RedisPubSubService as jest.Mock).mockImplementation(() => mockRedisPubSubServiceInstance);
        await plugin.initialize(redisPluginConfig, mockServiceInstance as unknown as Service);
        await plugin.cleanup();
        expect(mockRedisPubSubServiceInstance.close).toHaveBeenCalled();
        expect(plugin['redisService']).toBeUndefined();
    });
  });
});
