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

  public async initialize(config: LangchainPluginConfig, dependencies: Map<string, IPlugin>): Promise<void> {
    this.config = { ...this.config, ...config };
    // Logger.debug(`Plugin ${this.name} received dependencies: ${Array.from(dependencies.keys())}`);

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
        case 'azure': {
          if (!this.config.providerOptions?.azure) {
            throw new Error(`${this.name}: Azure provider requires providerOptions.azure configuration`);
          }
          
          const azureConfig = this.config.providerOptions.azure;
          llmConfig.azureOpenAIApiKey = this.config.auth.apiKey;
          llmConfig.azureOpenAIApiVersion = azureConfig.apiVersion;
          llmConfig.azureOpenAIApiInstanceName = azureConfig.instanceName;
          llmConfig.azureOpenAIApiDeploymentName = azureConfig.deploymentName;
          break;
        }
        case 'openai': {
          // Add any OpenAI specific configurations
          if (this.config.providerOptions?.openai?.organization) {
            llmConfig.organization = this.config.providerOptions.openai.organization;
          }
          break;
        }
        case 'anthropic': {
          // Could implement Anthropic client initialization
          throw new Error(`${this.name}: Provider '${this.config.provider}' is configured but not yet implemented`);
        }
        case 'gemini': {
          // Could implement Google's Gemini client initialization
          throw new Error(`${this.name}: Provider '${this.config.provider}' is configured but not yet implemented`);
        }  
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

      // Guard against undefined or null result
      if (result === undefined || result === null) {
        Logger.warn(`${this.name}: LLM chain returned undefined or null result`);
        return "No response received from LLM";
      }

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

  private messageHandler: MessageHandler | null = null;

  public async send(message: Message): Promise<void> {
    Logger.info(`${this.name}: send() called with message type: ${typeof message}`);
    
    // Extract prompt content from various message formats
    let promptContent: string | BaseMessage[] = '';
    
    if (typeof message === 'string') {
      // Simple string message
      promptContent = message;
    } else if (Array.isArray(message)) {
      // Check if it's an array of chat messages
      if (message.length > 0 && (
          'role' in message[0] || 
          message[0] instanceof HumanMessage || 
          message[0] instanceof SystemMessage || 
          message[0] instanceof AIMessage)) {
        
        // Handle array of chat messages directly
        if ('role' in message[0]) {
          // Convert to LangChain message format if they're in role/content format
          promptContent = message.map(msg => {
            const chatMsg = msg as { role: string; content: string };
            switch(chatMsg.role) {
              case 'user': return new HumanMessage({ content: chatMsg.content });
              case 'system': return new SystemMessage({ content: chatMsg.content });
              case 'ai': case 'assistant': return new AIMessage({ content: chatMsg.content });
              default: return new HumanMessage({ content: chatMsg.content });
            }
          });
        } else {
          // Already LangChain BaseMessage instances
          promptContent = message as unknown as BaseMessage[];
        }
      } else {
        // It's an array but not of chat messages - construct a prompt from array items
        promptContent = message.map(item => 
          typeof item === 'string' ? item : JSON.stringify(item)
        ).join('\n');
      }
    } else if (message && typeof message === 'object') {
      if (typeof message.content === 'string') {
        // Object with a direct content property
        promptContent = message.content;
      } else if (message.messages && Array.isArray(message.messages)) {
        // Object with a messages array (common pattern)
        return this.send(message.messages); // Recursively process the messages array
      } else if (message.prompt && typeof message.prompt === 'string') {
        // Object with a prompt property
        promptContent = message.prompt;
      } else if (message.query && typeof message.query === 'string') {
        // Object with a query property
        promptContent = message.query;
      } else if (message.text && typeof message.text === 'string') {
        // Object with a text property
        promptContent = message.text;
      } else if (message.input && typeof message.input === 'string') {
        // Object with an input property
        promptContent = message.input;
      } else {
        // Create a structured prompt from object properties
        const structuredPrompt = Object.entries(message)
          .filter(([_, value]) => value !== undefined && value !== null)
          .map(([key, value]) => {
            const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
            return `${key}: ${valueStr}`;
          })
          .join('\n');
          
        promptContent = structuredPrompt || JSON.stringify(message);
      }
    } else {
      // Fallback for null, undefined or other types
      promptContent = message ? String(message) : '';
      Logger.warn(`${this.name}: Received message of type ${typeof message}. Converting to string.`);
    }
    
    // Use the LLM to process the message if initialized
    if (this.llm) {
      try {
        Logger.debug(`${this.name}: Invoking LLM with processed prompt`);
        const response = await this.llm.invoke(promptContent);
        Logger.debug(`${this.name}: Message processed successfully by LLM`);

        // Notify any registered message handlers about the response
        if (this.messageHandler && typeof this.messageHandler === 'function') {
          if (typeof response.content === 'string') {
            this.messageHandler(response.content);
          } else {
            this.messageHandler(JSON.stringify(response.content));
          }
        }
      } catch (error) {
        Logger.error(
          `${this.name}: Error processing message with LLM: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw error;
      }
    } else {
      Logger.error(`${this.name}: Cannot process message, LLM not initialized`);
      throw new Error(`${this.name}: LLM not initialized`);
    }
  }

  public onMessage(handler: MessageHandler): void {
    Logger.info(`${this.name}: onMessage() handler registered.`);
    this.messageHandler = handler;
  }
  
  public async close(): Promise<void> {
    Logger.info(`${this.name}: close() called`);
    // Release any resources that need to be explicitly closed
    return this.cleanup();
  }
}
