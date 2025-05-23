import { IPlugin, Logger } from '@arifwidianto/msa-core';
import { LangchainPluginConfig } from './LangchainPluginConfig';
import { ChatOpenAI } from '@langchain/openai';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate, ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

export class LangchainPlugin implements IPlugin {
  public readonly name = 'msa-plugin-langchain';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private config: LangchainPluginConfig = { apiKey: '' }; // Default to empty, must be configured
  private llm: ChatOpenAI | null = null;

  public async initialize(config: LangchainPluginConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    if (!this.config.apiKey) {
      Logger.error(`${this.name}: API key is required but not provided.`);
      throw new Error(`${this.name}: API key is missing in plugin configuration.`);
    }

    try {
      this.llm = new ChatOpenAI({
        apiKey: this.config.apiKey,
        modelName: this.config.defaultModelName || 'gpt-3.5-turbo', // Default model
        temperature: 0.7, // Default temperature, can be made configurable
      });
      Logger.info(`${this.name}: ChatOpenAI client initialized successfully with model ${this.llm.modelName}.`);
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

    let PTemplate: PromptTemplate;
    if (typeof promptTemplate === 'string') {
      // Infer input variables from string - this is a simplistic approach
      // Langchain's PromptTemplate.fromTemplate does this better.
      const inputVariables = (promptTemplate.match(/{[^}]+}/g) || []).map(v => v.slice(1, -1));
      PTemplate = new PromptTemplate({ template: promptTemplate, inputVariables });
    } else {
      PTemplate = promptTemplate;
    }
    
    try {
      const chain = new LLMChain({ llm: this.llm, prompt: PTemplate });
      Logger.debug(`${this.name}: Invoking LLMChain with inputs: ${JSON.stringify(inputs)}`);
      const result = await chain.invoke(inputs);

      // The result structure from LLMChain can vary. Typically, it's { text: "response" }
      // or other keys if the prompt or chain is more complex.
      if (typeof result.text === 'string') {
        Logger.debug(`${this.name}: LLMChain invocation successful. Response: ${result.text}`);
        return result.text;
      } else if (typeof result === 'string') { // Sometimes the result itself is the string
        Logger.debug(`${this.name}: LLMChain invocation successful. Response: ${result}`);
        return result;
      } else {
        Logger.warn(`${this.name}: LLMChain response format unexpected. Full result: ${JSON.stringify(result)}`);
        // Attempt to find a string in the response, or stringify the whole thing
        return result.output || result.text || JSON.stringify(result);
      }
    } catch (error) {
      Logger.error(`${this.name}: Error invoking LLMChain: ${error instanceof Error ? error.message : String(error)}`);
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
}
