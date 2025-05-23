# MSA Message Broker Plugin (@arifwidianto/msa-plugin-messagebroker)

This plugin provides distributed messaging capabilities for the MSA framework, enabling reliable communication between microservices through industry-standard message brokers. It currently supports RabbitMQ and Redis Pub/Sub with a unified API.

## Features

* **Multi-Broker Support**:
  * RabbitMQ for robust, enterprise-grade message queuing
  * Redis Pub/Sub for lightweight, high-performance messaging
  * Unified API regardless of the underlying broker
  
* **Flexible Messaging Patterns**:
  * Publish-subscribe for broadcast communication
  * Work queues for distributed task processing
  * Request-reply for synchronous operations
  
* **Reliability Features**:
  * Connection management with automatic reconnection
  * Message acknowledgments for guaranteed delivery
  * Error handling and retry mechanisms
    *   `RedisPubSubService`: Encapsulates `redis` client logic for Pub/Sub.
    *   Both services handle connection management, publishing, subscribing with multiple handlers, and graceful closing.
*   **`MessageBrokerPlugin`**: Implements `IPlugin` and `ITransport` from `@arifwidianto/msa-core`.
    *   Manages the lifecycle of the chosen broker service (`RabbitMQService` or `RedisPubSubService`).
    *   Maps `ITransport` methods (`listen`, `send`, `onMessage`, `close`) to the active broker's operations.
*   **Configurable**: Supports broker-specific configurations (URLs, defaults, prefixes).

## Installation

```bash
npm install @arifwidianto/msa-plugin-messagebroker @arifwidianto/msa-core
```

For RabbitMQ support:
```bash
npm install amqplib @types/amqplib
```

For Redis support:
```bash
npm install redis
```

## Quick Start

### RabbitMQ Example

```typescript
import { Service, Logger } from '@arifwidianto/msa-core';
import { MessageBrokerPlugin } from '@arifwidianto/msa-plugin-messagebroker';

async function main() {
  const service = new Service();
  const brokerPlugin = new MessageBrokerPlugin();
  
  service.registerPlugin(brokerPlugin);
  
  await service.initializeService({
    'msa-plugin-messagebroker': {
      broker: 'rabbitmq',
      connectionString: 'amqp://localhost',
      queueName: 'tasks'
    }
  });
  
  await service.startService();
  
  // Set up message handler (consumer)
  brokerPlugin.subscribe((message) => {
    Logger.info(`Received message: ${JSON.stringify(message)}`);
    return true; // Acknowledge the message
  });
  
  // Publish a message
  await brokerPlugin.publish({
    type: 'task',
    data: {
      id: '123',
      action: 'process',
      payload: { value: 42 }
    }
  });
}

main().catch(console.error);
```

### Redis Example

```typescript
import { Service, Logger } from '@arifwidianto/msa-core';
import { MessageBrokerPlugin } from '@arifwidianto/msa-plugin-messagebroker';

async function main() {
  const service = new Service();
  const brokerPlugin = new MessageBrokerPlugin();
  
  service.registerPlugin(brokerPlugin);
  
  await service.initializeService({
    'msa-plugin-messagebroker': {
      broker: 'redis',
      connectionString: 'redis://localhost:6379',
      channels: ['notifications', 'events']
    }
  });
  
  await service.startService();
  
  // Set up message handler
  brokerPlugin.subscribe((message) => {
    Logger.info(`Received message: ${JSON.stringify(message)}`);
    return true;
  });
  
  // Publish a message to all subscribers
  await brokerPlugin.publish({
    channel: 'notifications',
    type: 'alert',
    data: {
      severity: 'high',
      message: 'System maintenance scheduled'
    }
  });
}

main().catch(console.error);
```

## Configuration

The MessageBroker Plugin can be configured with the following options:

```typescript
interface MessageBrokerPluginConfig {
  broker: 'rabbitmq' | 'redis'; // Which message broker to use
  connectionString: string;     // Connection URI for the broker
  
  // RabbitMQ specific options
  queueName?: string;           // Default queue to consume from and publish to
  exchangeName?: string;        // Exchange name (if using exchanges)
  exchangeType?: string;        // Exchange type (direct, fanout, topic, headers)
  routingKey?: string;          // Routing key for messages
  
  // Redis specific options
  channels?: string[];          // Redis channels to subscribe to
  
  // Common options
  reconnectInterval?: number;   // Milliseconds between reconnection attempts
  maxReconnectAttempts?: number; // Maximum number of reconnection attempts
}
```

### RabbitMQ Configuration Example

```typescript
{
  'msa-plugin-messagebroker': {
    broker: 'rabbitmq',
    connectionString: 'amqp://user:password@rabbitmq-server:5672',
    queueName: 'my-service-queue',
    exchangeName: 'my-exchange',
    exchangeType: 'topic',
    routingKey: 'events.#',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  }
}
```

### Redis Configuration Example

```typescript
{
  'msa-plugin-messagebroker': {
    broker: 'redis',
    connectionString: 'redis://redis-server:6379',
    channels: ['events', 'notifications', 'tasks'],
    reconnectInterval: 3000,
    maxReconnectAttempts: 5
  }
}
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

## API Reference

### publish(message)

Publish a message to the configured broker:

```typescript
// Publish a message
await brokerPlugin.publish({
  type: 'user.created',
  data: {
    userId: '12345',
    email: 'user@example.com'
  }
});

// Publish to a specific channel/queue/routing key
await brokerPlugin.publish({
  routingKey: 'users.created',  // For RabbitMQ
  channel: 'user-events',       // For Redis
  data: {
    userId: '12345',
    email: 'user@example.com'
  }
});
```

### subscribe(handler)

Subscribe to messages from the configured broker:

```typescript
// Subscribe to messages
brokerPlugin.subscribe((message) => {
  console.log('Received message:', message);
  
  try {
    // Process the message
    processMessage(message);
    
    // Acknowledge successful processing
    return true;
  } catch (error) {
    console.error('Failed to process message:', error);
    
    // Negative acknowledge (will be requeued in RabbitMQ)
    return false;
  }
});
```

### getClient()

Get access to the underlying broker client for advanced operations:

```typescript
// Get the underlying client
const client = brokerPlugin.getClient();

if (brokerPlugin.getBrokerType() === 'rabbitmq') {
  // RabbitMQ specific operations
  const channel = await client.createChannel();
  await channel.assertExchange('logs', 'topic', { durable: true });
  // ...
} else if (brokerPlugin.getBrokerType() === 'redis') {
  // Redis specific operations
  await client.set('key', 'value');
  // ...
}
```

## Advanced Usage

### Request-Reply Pattern

```typescript
// Service A - Sends request and waits for reply
async function sendRequest() {
  const correlationId = generateUniqueId();
  
  // Create a reply queue
  const replyQueue = await brokerPlugin.createQueue(`reply-${correlationId}`);
  
  // Subscribe to the reply queue
  brokerPlugin.subscribeToQueue(replyQueue, (response) => {
    if (response.correlationId === correlationId) {
      console.log('Got response:', response.data);
    }
  });
  
  // Send the request
  await brokerPlugin.publish({
    routingKey: 'requests',
    data: { action: 'get-user', userId: '12345' },
    properties: {
      correlationId: correlationId,
      replyTo: replyQueue
    }
  });
}

// Service B - Processes requests and sends replies
brokerPlugin.subscribeToQueue('requests', async (request) => {
  // Process the request
  const result = await processRequest(request.data);
  
  // Send the response back
  if (request.properties.replyTo) {
    await brokerPlugin.publish({
      routingKey: request.properties.replyTo,
      data: result,
      properties: {
        correlationId: request.properties.correlationId
      }
    });
  }
  
  return true; // Acknowledge
});
```

### Topic-Based Routing (RabbitMQ)

```typescript
// Publisher
async function publishEvents() {
  // Publish different types of events with different routing keys
  await brokerPlugin.publish({
    exchangeName: 'events',
    routingKey: 'user.created',
    data: { userId: '12345', action: 'created' }
  });
  
  await brokerPlugin.publish({
    exchangeName: 'events',
    routingKey: 'order.completed',
    data: { orderId: 'ORD-789', status: 'completed' }
  });
}

// Subscriber for user events
brokerPlugin.subscribeWithRoutingKey('events', 'user.*', (message) => {
  console.log('User event:', message);
  return true;
});

// Subscriber for all events
brokerPlugin.subscribeWithRoutingKey('events', '#', (message) => {
  console.log('All events:', message);
  return true;
});
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm run test

# Development mode with watch
npm run dev
```

## Integration with Other MSA Plugins

The message broker plugin works well with:

- `@arifwidianto/msa-plugin-http` - For REST API endpoints that trigger messages
- `@arifwidianto/msa-plugin-websocket` - To push broker messages to connected clients
- `@arifwidianto/msa-plugin-langchain` - For processing messages with LLM capabilities
