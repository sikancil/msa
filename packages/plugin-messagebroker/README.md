# MSA Message Broker Plugin (@arifwidianto/msa-plugin-messagebroker)

This plugin provides message broker capabilities for the MSA (Microservice Architecture) framework, supporting both RabbitMQ and Redis Pub/Sub. It allows services to publish messages to and subscribe to messages from a message queue or pub/sub channels.

## Features

*   **Multiple Broker Support**:
    *   **RabbitMQ Integration**: Connects to a RabbitMQ server, publishes messages, and subscribes to queues using `amqplib`.
    *   **Redis Pub/Sub Integration**: Connects to a Redis server and uses its Pub/Sub mechanism using `redis` (v4).
*   **Internal Service Logic**:
    *   `RabbitMQService`: Encapsulates `amqplib` logic for RabbitMQ.
    *   `RedisPubSubService`: Encapsulates `redis` client logic for Pub/Sub.
    *   Both services handle connection management, publishing, subscribing with multiple handlers, and graceful closing.
*   **`MessageBrokerPlugin`**: Implements `IPlugin` and `ITransport` from `@arifwidianto/msa-core`.
    *   Manages the lifecycle of the chosen broker service (`RabbitMQService` or `RedisPubSubService`).
    *   Maps `ITransport` methods (`listen`, `send`, `onMessage`, `close`) to the active broker's operations.
*   **Configurable**: Supports broker-specific configurations (URLs, defaults, prefixes).

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency. Dependencies (`amqplib`, `redis`, `@arifwidianto/msa-core`) and dev dependencies (`@types/amqplib`) should be managed by the monorepo's package manager.

```bash
# If managing dependencies manually:
npm install amqplib redis @arifwidianto/msa-plugin-messagebroker @arifwidianto/msa-core
npm install -D @types/amqplib # @types/redis not usually needed for redis v4+
# or
yarn add amqplib redis @arifwidianto/msa-plugin-messagebroker @arifwidianto/msa-core
yarn add -D @types/amqplib
```

## Configuration

The `MessageBrokerPlugin` is configured during service initialization. You must specify `clientType` as either `'rabbitmq'` or `'redis'` and provide the corresponding configuration object.

### `MessageBrokerPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

// Configuration for RabbitMQ
export interface RabbitMQConfig {
  url: string; // e.g., 'amqp://guest:guest@localhost:5672/'
  defaultExchange?: { 
    name: string; 
    type?: 'direct' | 'topic' | 'headers' | 'fanout';
    options?: object; // amqplib assertExchange options (e.g., { durable: true })
  };
  defaultQueue?: { 
    name: string; 
    options?: object; // amqplib assertQueue options (e.g., { durable: true })
  };
}

// Configuration for Redis Pub/Sub
export interface RedisConfig {
  url?: string; // e.g., 'redis://localhost:6379'
  host?: string; // Alternative to URL if not using full URL format
  port?: number;
  password?: string;
  defaultChannelPrefix?: string; // Optional: e.g., 'msa-app:' prepended to channel names
}

// Main plugin configuration
export interface MessageBrokerPluginConfig extends PluginConfig {
  clientType: 'rabbitmq' | 'redis'; // Specify which broker to use
  rabbitmq?: RabbitMQConfig;     // Provide if clientType is 'rabbitmq'
  redis?: RedisConfig;         // Provide if clientType is 'redis'
}
```

### Environment Variables

It's highly recommended to provide connection URLs and other sensitive details (like passwords) via environment variables, using `@arifwidianto/msa-core`'s `Config` class.

Examples:
*   `RABBITMQ_URL="amqp://user:pass@your-rabbitmq-server:5672"`
*   `REDIS_URL="redis://:yourpassword@your-redis-server:6379"`

### Example Service Setup

```typescript
// In your main service setup
import { Service, Config, Logger, Message, MessageHandler } from '@arifwidianto/msa-core';
import { MessageBrokerPlugin, MessageBrokerPluginConfig } from '@arifwidianto/msa-plugin-messagebroker';

const service = new Service(); // Assume Service has getLogger method
const mbPlugin = new MessageBrokerPlugin();

// --- RabbitMQ Configuration Example ---
const rabbitMqPluginConfig: MessageBrokerPluginConfig = {
  clientType: 'rabbitmq',
  rabbitmq: {
    url: Config.get('RABBITMQ_URL', 'amqp://localhost'),
    defaultExchange: { name: 'app_default_exchange', type: 'topic' },
    defaultQueue: { name: 'app_default_queue' }
  }
};

// --- Redis Configuration Example ---
const redisPluginConfig: MessageBrokerPluginConfig = {
  clientType: 'redis',
  redis: {
    url: Config.get('REDIS_URL', 'redis://localhost:6379'),
    defaultChannelPrefix: 'myapp:'
  }
};

// Choose one configuration to use:
const chosenConfig = Config.get('BROKER_TYPE') === 'redis' ? redisPluginConfig : rabbitMqPluginConfig;

// Ensure URL is found for the chosen client type
let brokerUrlValid = false;
if (chosenConfig.clientType === 'rabbitmq' && chosenConfig.rabbitmq?.url) {
    brokerUrlValid = true;
} else if (chosenConfig.clientType === 'redis' && (chosenConfig.redis?.url || (chosenConfig.redis?.host && chosenConfig.redis?.port))) {
    brokerUrlValid = true;
}

if (!brokerUrlValid) {
  Logger.error("Message Broker URL not found or client type invalid. Plugin will not work.");
  // Handle missing URL appropriately
} else {
  service.registerPlugin(mbPlugin);
}

// Initialize and start the service
async function main() {
  await mbPlugin.initialize(chosenConfig, service); // Pass service for scoped logger
  await service.startService(); // This calls mbPlugin.start() which connects the chosen broker service

  // Now MessageBrokerPlugin ITransport methods can be used.
  
  if (chosenConfig.clientType === 'rabbitmq') {
    // Example: Subscribe to a RabbitMQ queue
    const subId = await mbPlugin.listen('my_rabbit_queue', (msgContent: Message) => {
      Logger.info(`RabbitMQ message on my_rabbit_queue: ${msgContent}`);
    });
    Logger.info(`Subscribed to 'my_rabbit_queue'. Sub ID: ${subId}`);
    
    // Example: Publish to RabbitMQ
    await mbPlugin.send({ data: "Hello RabbitMQ!" }, 'my.routing.key');
  } else if (chosenConfig.clientType === 'redis') {
    // Example: Subscribe to a Redis channel
    const subId = await mbPlugin.listen('my_redis_channel', (msgContent: Message) => {
      Logger.info(`Redis message on my_redis_channel: ${msgContent}`);
    });
    Logger.info(`Subscribed to 'my_redis_channel'. Sub ID: ${subId}`);

    // Example: Publish to Redis channel
    await mbPlugin.send({ data: "Hello Redis!" }, 'my_redis_channel'); // For Redis, second arg is channel
  }
}

main().catch(error => Logger.error({ msg: "Service failed to start or run", error }));
```

## `ITransport` Implementation Details

The `MessageBrokerPlugin` implements the `ITransport` interface from `@arifwidianto/msa-core`. Its behavior adapts based on the configured `clientType`.

*   **`listen(topicOrQueueName: string, handler?: MessageHandler): Promise<string | void>`**:
    *   **RabbitMQ**: Subscribes to the specified `queueName`. The `handler` is called for each message. Returns a `subscriptionId`.
    *   **Redis**: Subscribes to the specified `channelName` (prefixed by `defaultChannelPrefix` if configured). The `handler` is called for each message. Returns a `subscriptionId`.
    *   A unique `subscriptionId` is generated by the plugin for each call to `listen` that successfully establishes a handler. This ID is used with `close(subscriptionId)` to remove a specific handler.

*   **`send(message: Message, topicOrRoutingKey?: string, exchange?: string): Promise<void>`**:
    *   **RabbitMQ**: Publishes the `message`. `topicOrRoutingKey` is the RabbitMQ `routingKey`. `exchange` is the target exchange (uses `defaultExchange` if `exchange` is null/undefined).
    *   **Redis**: Publishes the `message`. `topicOrRoutingKey` **must** be provided and is used as the Redis `channelName`. The `exchange` argument is ignored for Redis.
    *   The `message` can be a `string`, `Buffer`, or a JavaScript `object` (which will be JSON-stringified before sending).

*   **`onMessage(handler: MessageHandler, topicOrQueueName?: string): void`**:
    *   A convenience method that calls `this.listen(targetTopicOrQueue, handler)`.
    *   **RabbitMQ**: If `topicOrQueueName` is not provided, it uses `defaultQueue.name` from the RabbitMQ configuration.
    *   **Redis**: If `topicOrQueueName` is not provided, it might use a default channel (e.g., `defaultChannelPrefix` + 'default'). It's generally better to provide an explicit channel for Redis.

*   **`close(subscriptionId?: string): Promise<void>`**:
    *   If a `subscriptionId` (obtained from `listen`) is provided:
        *   **RabbitMQ**: Attempts to remove the specific handler associated with that `subscriptionId`. If it's the last handler for a given RabbitMQ consumer tag, the consumer itself might be cancelled.
        *   **Redis**: Attempts to remove the specific handler. If it's the last handler for a given Redis channel, the client unsubscribes from that channel.
    *   If no `subscriptionId` is provided: Closes the entire connection for the active broker (RabbitMQ or Redis), stopping all subscriptions and publishing capabilities for this plugin instance.

## Choosing Between RabbitMQ and Redis

*   **RabbitMQ**: A feature-rich message broker with support for complex routing (exchanges, queues, bindings), message persistence, acknowledgements, and more. Suitable for scenarios requiring high reliability, guaranteed delivery, and complex message workflows.
*   **Redis Pub/Sub**: A simpler, very fast publish/subscribe mechanism. Messages are "fire and forget" – if no subscribers are listening when a message is published, the message is lost. Good for real-time notifications, event broadcasting where some message loss is acceptable, or transient messaging.

Select the `clientType` and configure accordingly based on your application's needs.

This plugin provides a versatile foundation for integrating message-driven patterns into your MSA services. Remember to handle message (de)serialization appropriately for complex objects.
