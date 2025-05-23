import { PluginConfig } from '@arifwidianto/msa-core';

export interface LangchainPluginConfig extends PluginConfig {
  /** Which LLM provider to use (openai, azure, anthropic, gemini, etc.) */
  provider: string;

  /** Optional default model name for the chosen provider */
  defaultModelName?: string;

  /** Authentication credentials for the selected provider */
  auth: {
    apiKey: string;
    // add token, secret, or other auth fields as needed
  };

  /** Provider-specific options (e.g., Azure API version/deployment, OpenAI org, Anthropic safety settings) */
  providerOptions?: {
    openai?: { organization?: string };
    azure?: {
      apiVersion: string;
      instanceName: string;
      deploymentName: string;
    };
    anthropic?: { /* safety settings, model version */ };
    // add other providers here
  };
}
