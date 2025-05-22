import { PluginConfig } from '@arifwidianto/msa-core';

/**
 * Configuration for the StdioPlugin.
 * This can be expanded with options like:
 * - defaultPrompt: string - The default prompt string for Inquirer.
 * - commandNotFoundHandler: (command: string) => void - Custom handler for unknown commands.
 */
export interface StdioPluginConfig extends PluginConfig {
  interactive?: boolean; // If true, might start in an interactive loop by default
  promptPrefix?: string; // Prefix for inquirer prompts
}
