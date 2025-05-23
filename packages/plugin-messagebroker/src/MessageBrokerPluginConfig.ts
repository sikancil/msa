import { PluginConfig } from '@arifwidianto/msa-core';

export interface RabbitMQConfig {
  url: string; // e.g., 'amqp://localhost'
  defaultExchange?: { name: string; type?: string; options?: object }; // Optional default exchange
  defaultQueue?: { name: string; options?: object }; // Optional default queue for simple scenarios
}

export interface RedisConfig {
  url?: string; // e.g., 'redis://localhost:6379'
  host?: string; // Alternative to URL
  port?: number;
  password?: string;
  defaultChannelPrefix?: string; // e.g., 'msa-app:'
}

export interface MessageBrokerPluginConfig extends PluginConfig {
  clientType: 'rabbitmq' | 'redis'; // Add 'redis'
  rabbitmq?: RabbitMQConfig;
  redis?: RedisConfig;
}
