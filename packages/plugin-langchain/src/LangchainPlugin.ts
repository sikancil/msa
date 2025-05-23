import { IPlugin, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core';
import { LangchainPluginConfig } from './LangchainPluginConfig';
import { ChatOpenAI } from '@langchain/openai';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate, ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export class LangchainPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-langchain';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private config: LangchainPluginConfig = { provider: 'openai', auth: { apiKey: '' } }; // Default to empty, must be configured
  private llm: ChatOpenAI | null = null;

  public async initialize(config: LangchainPluginConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    if (!this.config.auth.apiKey) {
      Logger.error(`${this.name}: API key is required but not provided.`);
      throw new Error(`${this.name}: API key is missing in plugin configuration.`);
    }

    try {
      // Base configuration for the LLM
      const llmConfig: any = {
        apiKey: this.config.auth.apiKey,
        modelName: this.config.defaultModelName || 'gpt-3.5-turbo', // Default model
        temperature: 0.7, // Default temperature, can be made configurable
      };

      // Handle provider-specific configuration
      switch (this.config.provider.toLowerCase()) {
        case 'azure':
          if (!this.config.providerOptions?.azure) {
            throw new Error(`${this.name}: Azure provider requires providerOptions.azure configuration`);
          }
          
          const azureConfig = this.config.providerOptions.azure;
          llmConfig.azureOpenAIApiKey = this.config.auth.apiKey;
          llmConfig.azureOpenAIApiVersion = azureConfig.apiVersion;
          llmConfig.azureOpenAIApiInstanceName = azureConfig.instanceName;
          llmConfig.azureOpenAIApiDeploymentName = azureConfig.deploymentName;
          break;
          
        case 'openai':
          // Add any OpenAI specific configurations
          if (this.config.providerOptions?.openai?.organization) {
            llmConfig.organization = this.config.providerOptions.openai.organization;
          }
          break;

        case 'anthropic':
          // Could implement Anthropic client initialization
          throw new Error(`${this.name}: Provider '${this.config.provider}' is configured but not yet implemented`);

        case 'gemini':
          // Could implement Google's Gemini client initialization
          throw new Error(`${this.name}: Provider '${this.config.provider}' is configured but not yet implemented`);
          
        default:
          throw new Error(`${this.name}: Unknown LLM provider '${this.config.provider}'`);
      }
      
      this.llm = new ChatOpenAI(llmConfig);
      Logger.info(`${this.name}: ChatOpenAI client initialized successfully with model ${this.llm.modelName} using ${this.config.provider} provider.`);
    } catch (error) {
      Logger.error(`${this.name}: Failed to initialize ChatOpenAI client: ${error instanceof Error ? error.message : String(error)}`);
      throw error; // Re-throw the error to signal initialization failure
    }
  }

  public async start(): Promise<void> {
    Logger.info(`${this.name}: start() called. No specific start actions required for this plugin.`);
  }

  public async stop(): Promise<void> {
    Logger.info(`${this.name}: stop() called. No specific stop actions required for this plugin.`);
  }

  public async cleanup(): Promise<void> {
    Logger.info(`${this.name}: cleanup() called. Releasing resources.`);
    this.llm = null; // Allow garbage collection
  }

  public async invokeChain(promptTemplate: string | PromptTemplate, inputs: Record<string, any>): Promise<string> {
    if (!this.llm) {
      Logger.error(`${this.name}: LLM not initialized. Cannot invoke chain.`);
      throw new Error(`${this.name}: LLM not initialized.`);
    }

    let prompt: PromptTemplate;
    if (typeof promptTemplate === 'string') {
      prompt = PromptTemplate.fromTemplate(promptTemplate);
    } else {
      prompt = promptTemplate;
    }
    
    try {
      // Using LCEL (Langchain Expression Language)
      const chain = prompt.pipe(this.llm);
      Logger.debug(`${this.name}: Invoking LLM chain with inputs: ${JSON.stringify(inputs)}`);
      const result = await chain.invoke(inputs);

      // Handle different response formats
      if (typeof result === 'string') {
        Logger.debug(`${this.name}: LLM chain invocation successful. Response: ${result}`);
        return result;
      } else if (result?.content && typeof result.content === 'string') {
        // AIMessage response with content property
        Logger.debug(`${this.name}: LLM chain invocation successful. Response content: ${result.content}`);
        return result.content;
      } else if (typeof result?.text === 'string') {
        // Legacy format with text property
        Logger.debug(`${this.name}: LLM chain invocation successful. Response text: ${result.text}`);
        return result.text;
      } else {
        Logger.warn(`${this.name}: LLM chain response format unexpected. Full result: ${JSON.stringify(result)}`);
        // Attempt to stringify the whole result if none of the above formats match
        return JSON.stringify(result);
      }
    } catch (error) {
      Logger.error(`${this.name}: Error invoking LLM chain: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  public async chat(messages: Array<{ role: 'user' | 'system' | 'ai'; content: string }>): Promise<string> {
    if (!this.llm) {
      Logger.error(`${this.name}: LLM not initialized. Cannot perform chat.`);
      throw new Error(`${this.name}: LLM not initialized.`);
    }

    const langChainMessages: BaseMessage[] = messages.map(msg => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage({ content: msg.content });
        case 'ai':
          return new AIMessage({ content: msg.content });
        case 'system':
          return new SystemMessage({ content: msg.content });
        default:
          // Should not happen with typed input, but good for robustness
          Logger.warn(`${this.name}: Unknown message role encountered: ${msg.role}. Treating as user message.`);
          return new HumanMessage({ content: msg.content });
      }
    });

    try {
      Logger.debug(`${this.name}: Invoking chat model with messages: ${JSON.stringify(messages)}`);
      const response = await this.llm.invoke(langChainMessages);
      if (typeof response.content === 'string') {
         Logger.debug(`${this.name}: Chat invocation successful. Response: ${response.content}`);
        return response.content;
      } else {
        // Langchain AIMessage content can be string | MessageContentComplex[]
        // For simplicity, we'll stringify if not a simple string.
        const responseContent = JSON.stringify(response.content);
        Logger.debug(`${this.name}: Chat invocation successful. Complex response content: ${responseContent}`);
        return responseContent;
      }
    } catch (error) {
      Logger.error(`${this.name}: Error during chat invocation: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  public getLLM(): ChatOpenAI | null {
    return this.llm;
  }

  // ITransport implementation
  public async listen(portOrPath: number | string): Promise<void> {
    Logger.info(`${this.name}: listen() called with port/path: ${portOrPath}`);
    // For LangchainPlugin, listen doesn't apply directly but we implement it for interface compliance
    // We could use this to set up a local server for model inference if needed in the future
  }

  public async send(message: Message): Promise<void> {
    Logger.info(`${this.name}: send() called with message: ${JSON.stringify(message)}`);
    
    // If message is a string or has content property, we can process it as a prompt
    let promptContent: string;
    if (typeof message === 'string') {
      promptContent = message;
    } else if (message && typeof message.content === 'string') {
      promptContent = message.content;
    } else {
      // Attempt to stringify any other message format
      promptContent = JSON.stringify(message);
    }
    
    // Use the LLM to process the message if initialized
    if (this.llm) {
      try {
        const response = await this.llm.invoke(promptContent);
        // The response handling is done by the caller of this method
        Logger.debug(`${this.name}: Message processed successfully by LLM`);
      } catch (error) {
        Logger.error(`${this.name}: Error processing message with LLM: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    } else {
      Logger.error(`${this.name}: Cannot process message, LLM not initialized`);
      throw new Error(`${this.name}: LLM not initialized`);
    }
  }

  public onMessage(handler: MessageHandler): void {
    Logger.info(`${this.name}: onMessage() handler registered.`);
    // For Langchain plugin, we don't receive external messages directly as it's a provider
    // rather than a consumer, but we implement the method for interface compliance
  }
  
  public async close(): Promise<void> {
    Logger.info(`${this.name}: close() called`);
    // Release any resources that need to be explicitly closed
    return this.cleanup();
  }
}
