import { LangchainPlugin, LangchainPluginConfig } from '../src';
import { Logger } from '@arifwidianto/msa-core';
import { ChatOpenAI } from '@langchain/openai';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';

// Mock Logger from @arifwidianto/msa-core
jest.mock('@arifwidianto/msa-core', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock @langchain/openai
const mockChatOpenAIInstance = {
  invoke: jest.fn(),
  modelName: 'mock-gpt-3.5-turbo',
};
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn(() => mockChatOpenAIInstance),
}));

// Mock langchain/chains
const mockLLMChainInstance = {
  invoke: jest.fn(),
};
jest.mock('langchain/chains', () => ({
  LLMChain: jest.fn(() => mockLLMChainInstance),
}));

// Mock @langchain/core/prompts (if specific methods like fromTemplate are used internally)
// For now, we assume PromptTemplate is instantiated directly or its methods are not critical to mock for these tests
jest.mock('@langchain/core/prompts', () => ({
  PromptTemplate: jest.fn((params) => ({ ...params, format: jest.fn() })), // Simple mock
}));


describe('LangchainPlugin', () => {
  let plugin: LangchainPlugin;
  const defaultConfig: LangchainPluginConfig = {
    provider: 'openai',
    auth: {
      apiKey: 'test-api-key'
    },
    defaultModelName: 'gpt-test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new LangchainPlugin();
  });

  describe('Initialization', () => {
    it('should initialize ChatOpenAI with provided API key and model name', async () => {
      await plugin.initialize(defaultConfig, new Map());
      expect(ChatOpenAI).toHaveBeenCalledWith({
        apiKey: defaultConfig.auth.apiKey,
        modelName: defaultConfig.defaultModelName,
        temperature: 0.7, // Default or configured temperature
      });
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('ChatOpenAI client initialized successfully'));
      expect(plugin.getLLM()).toBe(mockChatOpenAIInstance);
    });

    it('should use default model name if not provided in config', async () => {
      const configNoModel: LangchainPluginConfig = { 
        provider: 'openai',
        auth: { apiKey: 'test-api-key' }
      };
      await plugin.initialize(configNoModel, new Map());
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: 'gpt-3.5-turbo', // Internal default
      }));
    });

    it('should throw error if API key is not provided', async () => {
      const configNoApi: LangchainPluginConfig = { 
        provider: 'openai',
        auth: { apiKey: '' }
      };
      await expect(plugin.initialize(configNoApi, new Map())).rejects.toThrow(
        `${plugin.name}: API key is missing in plugin configuration.`
      );
      expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('API key is required'));
    });
    
    it('should handle errors during ChatOpenAI client initialization', async () => {
        const initError = new Error("Failed to connect");
        (ChatOpenAI as unknown as jest.Mock).mockImplementationOnce(() => { throw initError; });
        await expect(plugin.initialize(defaultConfig, new Map())).rejects.toThrow(initError);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to initialize ChatOpenAI client: ${initError.message}`));
    });
  });

  describe('invokeChain', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('should invoke LLMChain with given prompt and inputs, returning text', async () => {
      const promptTemplate = 'Translate {text} to {language}.';
      const inputs = { text: 'hello', language: 'French' };
      const mockResponse = { text: 'bonjour' };
      (mockLLMChainInstance.invoke as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await plugin.invokeChain(promptTemplate, inputs);

      expect(PromptTemplate).toHaveBeenCalledWith({
        template: promptTemplate,
        inputVariables: ['text', 'language'], // Inferred by the plugin
      });
      expect(LLMChain).toHaveBeenCalledWith({
        llm: mockChatOpenAIInstance,
        prompt: expect.any(Object), // The mocked PromptTemplate instance
      });
      expect(mockLLMChainInstance.invoke).toHaveBeenCalledWith(inputs);
      expect(result).toBe(mockResponse.text);
    });
    
    it('should use PromptTemplate instance directly if provided', async () => {
        const PTemplate = new PromptTemplate({template: "Q: {question}", inputVariables: ["question"]});
        const inputs = { question: "What is AI?" };
        const mockResponse = { text: "AI is..." };
        (mockLLMChainInstance.invoke as jest.Mock).mockResolvedValueOnce(mockResponse);

        await plugin.invokeChain(PTemplate, inputs);
        expect(LLMChain).toHaveBeenCalledWith(expect.objectContaining({ prompt: PTemplate }));
        expect(mockLLMChainInstance.invoke).toHaveBeenCalledWith(inputs);
    });

    it('should throw error if LLM is not initialized', async () => {
      const uninitializedPlugin = new LangchainPlugin(); // No initialize call
      await expect(uninitializedPlugin.invokeChain('prompt', {})).rejects.toThrow('LLM not initialized.');
    });
    
    it('should handle LLMChain error', async () => {
        const error = new Error("LLMChain failed");
        (mockLLMChainInstance.invoke as jest.Mock).mockRejectedValueOnce(error);
        await expect(plugin.invokeChain("Test", {})).rejects.toThrow(error);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error invoking LLMChain: ${error.message}`));
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      await plugin.initialize(defaultConfig, new Map());
    });

    it('should invoke chat model with formatted messages and return AI content', async () => {
      const messages = [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hello AI.' },
      ];
      const mockResponseContent = 'Hello user!';
      (mockChatOpenAIInstance.invoke as jest.Mock).mockResolvedValueOnce(new AIMessage(mockResponseContent));

      const result = await plugin.chat(messages);

      expect(mockChatOpenAIInstance.invoke).toHaveBeenCalledWith([
        expect.any(SystemMessage), // Or use expect.objectContaining({ content: 'You are helpful.'})
        expect.any(HumanMessage),  // Or use expect.objectContaining({ content: 'Hello AI.'})
      ]);
      expect(result).toBe(mockResponseContent);
    });

    it('should throw error if LLM is not initialized for chat', async () => {
      const uninitializedPlugin = new LangchainPlugin();
      await expect(uninitializedPlugin.chat([])).rejects.toThrow('LLM not initialized.');
    });
    
    it('should handle chat model error', async () => {
        const error = new Error("Chat failed");
        (mockChatOpenAIInstance.invoke as jest.Mock).mockRejectedValueOnce(error);
        await expect(plugin.chat([])).rejects.toThrow(error);
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error during chat invocation: ${error.message}`));
    });
  });

  describe('Lifecycle Methods (start, stop, cleanup)', () => {
    it('start() should log info and do nothing else', async () => {
      await plugin.start();
      expect(Logger.info).toHaveBeenCalledWith(`${plugin.name}: start() called. No specific start actions required for this plugin.`);
    });

    it('stop() should log info and do nothing else', async () => {
      await plugin.stop();
      expect(Logger.info).toHaveBeenCalledWith(`${plugin.name}: stop() called. No specific stop actions required for this plugin.`);
    });

    it('cleanup() should log info and nullify LLM', async () => {
      await plugin.initialize(defaultConfig, new Map()); // Initialize to have an LLM instance
      expect(plugin.getLLM()).not.toBeNull();
      await plugin.cleanup();
      expect(Logger.info).toHaveBeenCalledWith(`${plugin.name}: cleanup() called. Releasing resources.`);
      expect(plugin.getLLM()).toBeNull();
    });
  });
});
