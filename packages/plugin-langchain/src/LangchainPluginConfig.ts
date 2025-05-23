import { PluginConfig } from '@arifwidianto/msa-core';

export interface LangchainPluginConfig extends PluginConfig {
  apiKey: string; // Generic name, can be specific like openAIApiKey
  defaultModelName?: string;
  // Add other relevant Langchain provider specific configs
  // For example, if using Azure OpenAI:
  // azureOpenAIApiVersion?: string;
  // azureOpenAIApiInstanceName?: string;
  // azureOpenAIApiDeploymentName?: string;
}
