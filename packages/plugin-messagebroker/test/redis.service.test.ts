import { RedisPubSubService } from '../src/redis.service';
import { RedisConfig } from '../src/MessageBrokerPluginConfig';
import { Logger, MessageHandler } from '@arifwidianto/msa-core';
import { createClient, RedisClientType } from 'redis';

// Mock Logger from @arifwidianto/msa-core
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const MockLogger = mockLoggerInstance as unknown as Logger;

// Mock 'redis' client
const mockRedisClientInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockResolvedValue(0), // 0 is a valid return for publish (number of clients received)
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  isOpen: true, // Simulate connected state by default after connect()
  duplicate: jest.fn(), // Important for publisher/subscriber separation
};
// Ensure duplicate returns a new mock instance for the subscriber
const mockSubscriberInstance = { ...mockRedisClientInstance, duplicate: jest.fn() }; // Subscriber shouldn't duplicate again
mockRedisClientInstance.duplicate.mockReturnValue(mockSubscriberInstance as unknown as RedisClientType);


jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClientInstance as unknown as RedisClientType),
}));

describe('RedisPubSubService', () => {
  let service: RedisPubSubService;
  const config: RedisConfig = {
    url: 'redis://localhost:6379',
    defaultChannelPrefix: 'msa-test:',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset isOpen state for mocks before each test, assuming connect will set it
    mockRedisClientInstance.isOpen = false;
    mockSubscriberInstance.isOpen = false;
    service = new RedisPubSubService(config, MockLogger);
  });

  describe('connect', () => {
    it('should connect both publisher and subscriber clients', async () => {
      // Simulate connect() making them "open"
      (mockRedisClientInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockRedisClientInstance.isOpen = true; });
      (mockSubscriberInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockSubscriberInstance.isOpen = true; });

      await service.connect();
      expect(createClient).toHaveBeenCalledTimes(1); // Called once, then duplicated
      expect(mockRedisClientInstance.duplicate).toHaveBeenCalledTimes(1);
      expect(mockRedisClientInstance.connect).toHaveBeenCalled();
      expect(mockSubscriberInstance.connect).toHaveBeenCalled();
      expect(MockLogger.info).toHaveBeenCalledWith('Connected to Redis for Pub/Sub');
    });

    it('should handle connection error', async () => {
      const error = new Error('Redis connection failed');
      (mockRedisClientInstance.connect as jest.Mock).mockRejectedValueOnce(error);
      await expect(service.connect()).rejects.toThrow(error);
      expect(MockLogger.error).toHaveBeenCalledWith({ error }, 'Failed to connect to Redis');
    });
    
    it('should register error listeners for publisher and subscriber', () => {
        // Constructor is called in beforeEach
        expect(mockRedisClientInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(mockSubscriberInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      // Simulate successful connection
      (mockRedisClientInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockRedisClientInstance.isOpen = true; });
      (mockSubscriberInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockSubscriberInstance.isOpen = true; });
      await service.connect();
    });

    it('should publish a message to the correct channel with prefix', async () => {
      const channel = 'test-channel';
      const message = { data: 'hello' };
      await service.publish(channel, message);
      const fullChannel = `${config.defaultChannelPrefix}${channel}`;
      expect(mockRedisClientInstance.publish).toHaveBeenCalledWith(fullChannel, JSON.stringify(message));
      expect(MockLogger.debug).toHaveBeenCalledWith({ channel: fullChannel }, 'Message published to Redis channel');
    });

    it('should throw error if publisher is not connected', async () => {
      mockRedisClientInstance.isOpen = false; // Simulate not connected
      await expect(service.publish('ch', 'msg')).rejects.toThrow('Redis publisher not connected.');
    });
  });

  describe('subscribe and unsubscribe', () => {
    let handler: jest.Mock<MessageHandler>;
    const channel = 'notifications';
    const fullChannel = `${config.defaultChannelPrefix}${channel}`;

    beforeEach(async () => {
      (mockRedisClientInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockRedisClientInstance.isOpen = true; });
      (mockSubscriberInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockSubscriberInstance.isOpen = true; });
      await service.connect();
      handler = jest.fn();
    });

    it('should subscribe to a channel and call Redis client subscribe if first handler', async () => {
      await service.subscribe(channel, handler);
      expect(mockSubscriberInstance.subscribe).toHaveBeenCalledWith(fullChannel, expect.any(Function));
      expect(MockLogger.info).toHaveBeenCalledWith(`Successfully subscribed to Redis channel: ${fullChannel}`);
      // @ts-ignore
      expect(service['messageHandlers'].get(fullChannel)).toContain(handler);
      // @ts-ignore
      expect(service['activeRedisSubscriptions'].has(fullChannel)).toBe(true);
    });

    it('should add handler without calling Redis client subscribe if already subscribed to channel', async () => {
      const handler2 = jest.fn();
      await service.subscribe(channel, handler); // First subscription
      await service.subscribe(channel, handler2); // Second subscription to same channel

      expect(mockSubscriberInstance.subscribe).toHaveBeenCalledTimes(1); // Only called once
      expect(MockLogger.info).toHaveBeenCalledWith(`Handler added for Redis channel: ${fullChannel}. Total handlers: 2`);
      // @ts-ignore
      expect(service['messageHandlers'].get(fullChannel)).toEqual([handler, handler2]);
    });

    it('should process incoming messages and call appropriate handlers', async () => {
      await service.subscribe(channel, handler);
      const handler2 = jest.fn();
      await service.subscribe(channel, handler2);

      // Simulate receiving a message from Redis
      const subscribeCallback = (mockSubscriberInstance.subscribe as jest.Mock).mock.calls[0][1];
      const testMessage = { content: 'event happened' };
      subscribeCallback(JSON.stringify(testMessage), fullChannel); // Redis sends message and channel

      expect(handler).toHaveBeenCalledWith(testMessage);
      expect(handler2).toHaveBeenCalledWith(testMessage);
    });

    it('should unsubscribe a specific handler and call Redis client unsubscribe if last handler', async () => {
      await service.subscribe(channel, handler);
      const handler2 = jest.fn();
      await service.subscribe(channel, handler2);

      await service.unsubscribe(channel, handler);
      // @ts-ignore
      expect(service['messageHandlers'].get(fullChannel)).toEqual([handler2]); // handler1 removed
      expect(mockSubscriberInstance.unsubscribe).not.toHaveBeenCalled(); // Still has handler2

      await service.unsubscribe(channel, handler2); // Remove last handler
      // @ts-ignore
      expect(service['messageHandlers'].has(fullChannel)).toBe(false);
      expect(mockSubscriberInstance.unsubscribe).toHaveBeenCalledWith(fullChannel);
      // @ts-ignore
      expect(service['activeRedisSubscriptions'].has(fullChannel)).toBe(false);
      expect(MockLogger.info).toHaveBeenCalledWith(`Successfully unsubscribed from Redis channel: ${fullChannel}`);
    });
    
    it('should unsubscribe all handlers for a channel if no specific handler is given', async () => {
        await service.subscribe(channel, handler);
        await service.subscribe(channel, jest.fn()); // Add another handler

        await service.unsubscribe(channel); // No specific handler
        // @ts-ignore
        expect(service['messageHandlers'].has(fullChannel)).toBe(false);
        expect(mockSubscriberInstance.unsubscribe).toHaveBeenCalledWith(fullChannel);
        // @ts-ignore
        expect(service['activeRedisSubscriptions'].has(fullChannel)).toBe(false);
    });

    it('should throw error if subscriber is not connected on subscribe', async () => {
      mockSubscriberInstance.isOpen = false;
      await expect(service.subscribe(channel, handler)).rejects.toThrow('Redis subscriber not connected.');
    });
  });

  describe('close', () => {
    it('should quit publisher and subscriber, and unsubscribe from all channels', async () => {
      // Simulate connected state and an active subscription
      (mockRedisClientInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockRedisClientInstance.isOpen = true; });
      (mockSubscriberInstance.connect as jest.Mock).mockImplementationOnce(async () => { mockSubscriberInstance.isOpen = true; });
      await service.connect();
      const handler = jest.fn();
      const channel1 = "channel1";
      await service.subscribe(channel1, handler);
      const fullChannel1 = `${config.defaultChannelPrefix}${channel1}`;

      await service.close();

      expect(mockSubscriberInstance.unsubscribe).toHaveBeenCalledWith([fullChannel1]); // Unsubscribe from active channels
      expect(mockSubscriberInstance.quit).toHaveBeenCalled();
      expect(mockRedisClientInstance.quit).toHaveBeenCalled();
      expect(MockLogger.info).toHaveBeenCalledWith('Redis Pub/Sub connections closed.');
      // @ts-ignore
      expect(service['activeRedisSubscriptions'].size).toBe(0);
      // @ts-ignore
      expect(service['messageHandlers'].size).toBe(0);
    });
  });
});
