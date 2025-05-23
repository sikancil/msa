# MSA Langchain Plugin (@arifwidianto/msa-plugin-langchain)

This plugin integrates Langchain capabilities into the MSA (Microservice Architecture) framework, allowing services to easily leverage Large Language Models (LLMs) for various tasks. It provides a configurable interface to interact with LLMs, primarily using OpenAI models through `@langchain/openai`.

## Features

*   Initializes a Langchain LLM client (currently `ChatOpenAI`).
*   Configurable API keys and default model names.
*   Provides a simple method `invokeChain` to run LLM chains with prompt templates.
*   Provides a `chat` method for direct conversational interactions with the LLM.
*   Implements `IPlugin` from `@arifwidianto/msa-core`.

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package. The necessary Langchain dependencies (`langchain`, `@langchain/openai`) should be automatically managed if using Lerna or npm/yarn workspaces.

```bash
# If managing dependencies manually within a package that uses this plugin:
npm install langchain @langchain/openai @arifwidianto/msa-plugin-langchain @arifwidianto/msa-core
# or
yarn add langchain @langchain/openai @arifwidianto/msa-plugin-langchain @arifwidianto/msa-core
```

## Configuration

The `LangchainPlugin` is configured during the service initialization phase. The configuration is passed to its `initialize` method.

### `LangchainPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

export interface LangchainPluginConfig extends PluginConfig {
  apiKey: string;           // Required: Your OpenAI API key.
  defaultModelName?: string; // Optional: The default OpenAI model to use (e.g., "gpt-4", "gpt-3.5-turbo").
                           // Defaults to "gpt-3.5-turbo" within the plugin.
  // Other provider-specific configurations can be added here.
}
```

### Environment Variables

It's highly recommended to provide the API key via environment variables rather than hardcoding it in configuration files. The `Config` class from `@arifwidianto/msa-core` can be used to fetch this.

Example: Set `OPENAI_API_KEY="your_api_key_here"` in your environment.

### Example Service Setup

```typescript
// In your main service setup
import { Service, Config, Logger } from '@arifwidianto/msa-core';
import { LangchainPlugin, LangchainPluginConfig } from '@arifwidianto/msa-plugin-langchain';

const service = new Service();
const langchainPlugin = new LangchainPlugin();

const pluginConfigs = {
  [langchainPlugin.name]: { // Use plugin.name for the key
    apiKey: Config.get('OPENAI_API_KEY'), // Fetch from environment
    defaultModelName: 'gpt-4-turbo-preview'
  } as LangchainPluginConfig
};

// Ensure API key is found
if (!pluginConfigs[langchainPlugin.name].apiKey) {
  Logger.error("OpenAI API Key not found in environment variable OPENAI_API_KEY. LangchainPlugin will not work.");
  // Handle missing key appropriately, perhaps by not registering or starting the plugin, or exiting.
} else {
  service.registerPlugin(langchainPlugin);
}

// Initialize and start the service
// await service.initializeService(pluginConfigs);
// await service.startService();
// Now langchainPlugin methods can be called.
```

## Basic Usage

### Invoking a Chain

The `invokeChain` method allows you to execute a prompt against the configured LLM.

```typescript
// Assuming langchainPlugin is an initialized instance of LangchainPlugin

async function summarizeText(textToSummarize: string) {
  const prompt = "Please provide a concise summary of the following text:\n{text}";
  const inputs = { text: textToSummarize };

  try {
    const summary = await langchainPlugin.invokeChain(prompt, inputs);
    Logger.info(`Summary: ${summary}`);
    return summary;
  } catch (error) {
    Logger.error(`Error getting summary: ${error}`);
    throw error;
  }
}

// summarizeText("Some long text here...");
```

You can also pass a `PromptTemplate` instance:
```typescript
import { PromptTemplate } from "@langchain/core/prompts";

// ...
const PTemplate = new PromptTemplate({template: "Tell me a joke about {topic}.", inputVariables: ["topic"]});
const joke = await langchainPlugin.invokeChain(PTemplate, { topic: "programmers" });
Logger.info(`Joke: ${joke}`);
// ...
```

### Chatting with the LLM

The `chat` method allows for conversational interactions.

```typescript
// Assuming langchainPlugin is an initialized instance of LangchainPlugin

async function askQuestion(question: string) {
  const messages = [
    { role: 'system' as const, content: 'You are a helpful assistant that answers questions accurately.' },
    { role: 'user' as const, content: question },
  ];

  try {
    const answer = await langchainPlugin.chat(messages);
    Logger.info(`AI Answer: ${answer}`);
    return answer;
  } catch (error) {
    Logger.error(`Error getting chat response: ${error}`);
    throw error;
  }
}

// askQuestion("What is the capital of France?");
```

### Direct LLM Access

For more advanced scenarios, you can get the underlying Langchain LLM instance:

```typescript
const llmInstance = langchainPlugin.getLLM();
if (llmInstance) {
  // Use llmInstance directly with Langchain's more advanced features
  // For example, llmInstance.generatePrompt(...) or llmInstance.stream(...)
}
```

## LLM Provider

This plugin currently uses `@langchain/openai` and is configured for OpenAI models. To use other LLM providers supported by Langchain (e.g., Anthropic, Cohere, local models via Ollama), the `LangchainPlugin.ts` would need to be modified to support different LLM client initializations and configurations.

This plugin provides a foundational layer for integrating Langchain into your MSA services. You can build more complex AI-driven features by leveraging these basic interaction patterns.
