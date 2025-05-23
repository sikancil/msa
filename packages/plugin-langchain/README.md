# MSA Langchain Plugin (@arifwidianto/msa-plugin-langchain)

This plugin integrates Langchain capabilities into the MSA (Microservice Architecture) framework, allowing services to easily leverage Large Language Models (LLMs) for various tasks. It provides a configurable interface to interact with LLMs, supporting multiple providers including OpenAI and Azure OpenAI.

## Features

* Seamless integration of LLMs into MSA services
* Support for multiple providers (OpenAI, Azure OpenAI, with placeholders for Anthropic, Gemini)
* Chat-based interactions with language models
* Prompt chain execution using Langchain Expression Language (LCEL)
* Implements both `IPlugin` and `ITransport` from `@arifwidianto/msa-core`
* Provider-specific configuration options

## Installation

```bash
npm install @arifwidianto/msa-plugin-langchain @arifwidianto/msa-core
```

## Quick Start

```typescript
import { Service } from '@arifwidianto/msa-core';
import { LangchainPlugin } from '@arifwidianto/msa-plugin-langchain';

async function main() {
  const service = new Service();
  const langchainPlugin = new LangchainPlugin();
  
  service.registerPlugin(langchainPlugin);
  
  await service.initializeService({
    'msa-plugin-langchain': {
      provider: 'openai',
      defaultModelName: 'gpt-3.5-turbo',
      auth: {
        apiKey: 'your-api-key'
      }
    }
  });
  
  await service.startService();
  
  // Use the plugin for LLM interactions
  const response = await langchainPlugin.invokeChain(
    'Summarize the following: {text}',
    { text: 'Your text to summarize goes here.' }
  );
  
  console.log('Summary:', response);
}

main().catch(console.error);
```

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package. The necessary Langchain dependencies (`langchain`, `@langchain/openai`) should be automatically managed if using Lerna or npm/yarn workspaces.

```bash
# If managing dependencies manually within a package that uses this plugin:
npm install langchain @langchain/openai @arifwidianto/msa-plugin-langchain @arifwidianto/msa-core
# or
yarn add langchain @langchain/openai @arifwidianto/msa-plugin-langchain @arifwidianto/msa-core
```

## Configuration

The `LangchainPlugin` can be configured during service initialization with the following options:

```typescript
interface LangchainPluginConfig {
  /** Which LLM provider to use (openai, azure, anthropic, gemini, etc.) */
  provider: string;

  /** Optional default model name for the chosen provider */
  defaultModelName?: string;

  /** Authentication credentials for the selected provider */
  auth: {
    apiKey: string;
    // add token, secret, or other auth fields as needed
  };

  /** Provider-specific options */
  providerOptions?: {
    openai?: { 
      organization?: string 
    };
    azure?: {
      apiVersion: string;
      instanceName: string;
      deploymentName: string;
    };
    // Support for other providers can be added
  };
}
```

### Provider Configuration Examples

#### OpenAI

```typescript
{
  provider: 'openai',
  defaultModelName: 'gpt-4',
  auth: {
    apiKey: 'sk-...'
  },
  providerOptions: {
    openai: {
      organization: 'org-...' // Optional
    }
  }
}
```

#### Azure OpenAI

```typescript
{
  provider: 'azure',
  defaultModelName: 'gpt-35-turbo', // The deployment name is specified below
  auth: {
    apiKey: 'your-azure-api-key'
  },
  providerOptions: {
    azure: {
      apiVersion: '2023-12-01-preview',
      instanceName: 'your-azure-instance',
      deploymentName: 'gpt-35-turbo'
    }
  }
}
```

## API Reference

### invokeChain(promptTemplate, inputs)

Execute an LLM chain using a prompt template with variable inputs.

```typescript
const result = await langchainPlugin.invokeChain(
  'Translate {text} to {language}.',
  { text: 'Hello world', language: 'French' }
);
// result: "Bonjour le monde"
```

You can also use a PromptTemplate instance:

```typescript
import { PromptTemplate } from '@langchain/core/prompts';

const prompt = PromptTemplate.fromTemplate('Generate a list of {number} {topic}.');
const result = await langchainPlugin.invokeChain(
  prompt,
  { number: '5', topic: 'programming languages' }
);
```

### chat(messages)

Have a conversation with the LLM using a series of messages.

```typescript
const response = await langchainPlugin.chat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the capital of France?' }
]);
// response: "The capital of France is Paris."
```

### getLLM()

Get the underlying ChatOpenAI instance for advanced use cases.

```typescript
const llm = langchainPlugin.getLLM();
// Use the raw Langchain ChatOpenAI instance
```

### ITransport Implementation

This plugin implements the `ITransport` interface, allowing it to be used in messaging patterns:

```typescript
// Send a message to the LLM
await langchainPlugin.send('Translate this text to Spanish: Hello world');

// Register for message events (not typically used with LLMs)
langchainPlugin.onMessage((response) => {
  console.log('Received:', response);
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
