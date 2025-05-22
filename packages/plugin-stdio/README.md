# MSA StdIO Plugin (@arifwidianto/msa-plugin-stdio)

This plugin provides a Standard Input/Output (StdIO) transport and command-line interface (CLI) capability for the MSA (Microservice Architecture) framework. It uses `yargs` for command-line argument parsing and `inquirer` for interactive prompts.

This plugin allows the MSA application to:
*   Define and handle CLI commands with arguments and options.
*   Output messages to the console (`stdout`/`stderr`).
*   Receive input from `stdin`, either as commands or through interactive prompts.
*   Optionally run in an interactive mode, continuously listening for input.

## Features

*   Parses command-line arguments using `yargs`.
*   Supports interactive prompts using `inquirer`.
*   Allows dynamic registration of CLI commands and their handlers.
*   Can output messages to the console.
*   Can listen for line-by-line input in an interactive mode.
*   Implements `IPlugin` and conceptually `ITransport` from `@arifwidianto/msa-core`.

## Installation

This plugin is typically used as part of an MSA framework monorepo. Ensure it's listed as a dependency in your service or application package. Dependencies (`yargs`, `inquirer`, and their types) should be managed by the monorepo's package manager.

## Configuration

The `StdioPlugin` can be configured during the service initialization phase.

### `StdioPluginConfig`

```typescript
import { PluginConfig } from '@arifwidianto/msa-core';

export interface StdioPluginConfig extends PluginConfig {
  interactive?: boolean; // If true, might start in an interactive loop by default if no command is given.
  promptPrefix?: string; // Prefix for inquirer prompts in interactive mode (e.g., "> ").
}
```

### Example Configuration

```typescript
// In your main service setup
import { Service } from '@arifwidianto/msa-core';
import { StdioPlugin, StdioPluginConfig } from '@arifwidianto/msa-plugin-stdio';

const service = new Service();
const stdioPlugin = new StdioPlugin();

const pluginConfigs = {
  'msa-plugin-stdio': {
    interactive: false, // Only run commands specified on CLI, don't drop into interactive mode
    promptPrefix: "app-cli> "
  } as StdioPluginConfig
};

service.registerPlugin(stdioPlugin);
await service.initializeService(pluginConfigs);
// start() will parse argv and execute commands or start interactive mode.
await service.startService(); 
```

## Basic Usage

### Defining CLI Commands

Commands are defined using the `addCommandHandler` method. This method takes the command string, description, yargs builder object (for options), and a handler function.

```typescript
import { ArgumentsCamelCase } from 'yargs';
// Assuming stdioPlugin is an instance of StdioPlugin that has been initialized

interface GreetArgs {
  name: string;
  enthusiastic?: boolean;
}

stdioPlugin.addCommandHandler<GreetArgs>(
  'greet <name>', // Command signature
  'Greets the specified person.', // Description
  { // Builder for yargs options
    name: {
      describe: 'The name of the person to greet',
      type: 'string',
      demandOption: true,
    },
    enthusiastic: {
      describe: 'Greet with enthusiasm',
      type: 'boolean',
      alias: 'e',
      default: false,
    },
  },
  (argv: ArgumentsCamelCase<GreetArgs>) => { // Handler function
    let greeting = `Hello, ${argv.name}!`;
    if (argv.enthusiastic) {
      greeting += '!!!';
    }
    stdioPlugin.send(greeting); // Output using the plugin's send method
    // Or console.log(greeting);
  }
);

// After all plugins are initialized and started,
// you can run this command from your terminal:
// $ node your-app.js greet "World" -e
// Output: Hello, World!!!!
```

### Sending Output

Use the `send(message: Message)` method (from `ITransport`) to print messages to `stdout`.

```typescript
stdioPlugin.send("This is a message to the console.");
stdioPlugin.send({ status: "OK", data: [1, 2, 3] }); // Objects will be JSON.stringified
```

### Receiving Input (Generic Handler)

You can register a generic message handler using `onMessage(handler: MessageHandler)`. This handler will receive:
*   Parsed command objects when a registered yargs command is executed.
*   Raw lines of input if the plugin is in interactive mode.

```typescript
import { Message, Logger } from '@arifwidianto/msa-core';

stdioPlugin.onMessage((message: Message) => {
  Logger.info(`StdIO Plugin received a message: ${JSON.stringify(message)}`);
  // If message.type === 'command', message.command and message.arguments are available.
  // If it's interactive input, it might be a raw string or a simple object.
});
```

### Interactive Prompts with Inquirer

Use the `prompt(questions: QuestionCollection)` method to ask the user questions.

```typescript
async function askForDetails() {
  const answers = await stdioPlugin.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'What is your username?',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      mask: '*',
    },
  ]);
  stdioPlugin.send(`Username: ${answers.username}`);
}
// Call askForDetails() from a command handler or other logic.
```

### Interactive Mode

If `config.interactive` is true and no command is provided via `process.argv`, or if `startInteractiveInput()` is called explicitly, the plugin will enter a loop, reading lines from `stdin`.

```typescript
// To start interactive mode (e.g., from a command handler):
// stdioPlugin.startInteractiveInput();

// In interactive mode, each line entered by the user can be passed to the 
// generic message handler if one is registered via `onMessage`.
// Type 'exit' or 'quit' to stop interactive mode.
```

## ITransport Implementation Notes

*   `listen()`: For StdIO, this prepares the plugin. The actual "listening" (processing `argv` or starting interactive input) happens in `start()`.
*   `send(message)`: Outputs the message to `stdout`.
*   `onMessage(handler)`: Registers a handler for parsed commands or lines from interactive input.
*   `close()`: Stops interactive input if active.

This plugin provides a flexible way to build CLI applications or add CLI controls to your MSA services.
