# MSA StdIO Plugin (@arifwidianto/msa-plugin-stdio)

This plugin adds command-line interface (CLI) capabilities and standard I/O handling to the MSA framework. It combines powerful command parsing with interactive prompts, making it ideal for building CLI applications or adding command-line control to MSA services.

## Features

* Command-line argument parsing with Yargs
* Interactive prompts and questions with Inquirer
* Dynamic registration of CLI commands with argument validation
* Interactive shell mode with command history
* Standard output/error stream management
* Line-by-line input listening in interactive mode
* Full console logging capabilities
* Support for both one-off commands and interactive sessions
* Implementation of both `IPlugin` and `ITransport` interfaces from `@arifwidianto/msa-core`

## Installation

```bash
npm install @arifwidianto/msa-plugin-stdio @arifwidianto/msa-core
```

## Quick Start

```typescript
import { Service, Logger } from '@arifwidianto/msa-core';
import { StdioPlugin } from '@arifwidianto/msa-plugin-stdio';
import { ArgumentsCamelCase } from 'yargs';

async function main() {
  const service = new Service();
  const stdioPlugin = new StdioPlugin();
  
  service.registerPlugin(stdioPlugin);
  
  await service.initializeService({
    'msa-plugin-stdio': {
      interactive: true,
      promptPrefix: "msa> "
    }
  });
  
  // Define commands before starting the service
  interface GreetOptions {
    name: string;
    enthusiastic?: boolean;
  }
  
  stdioPlugin.addCommandHandler<GreetOptions>(
    'greet <name>', 
    'Greet a person with a friendly message',
    {
      name: {
        describe: 'The name of the person to greet',
        type: 'string',
        demandOption: true
      },
      enthusiastic: {
        describe: 'Add extra enthusiasm',
        type: 'boolean',
        alias: 'e',
        default: false
      }
    },
    (argv: ArgumentsCamelCase<GreetOptions>) => {
      let greeting = `Hello, ${argv.name}!`;
      if (argv.enthusiastic) {
        greeting += '!!!';
      }
      stdioPlugin.send(greeting);
    }
  );
  
  // Add another command
  stdioPlugin.addCommandHandler(
    'date',
    'Show the current date and time',
    {},
    () => {
      stdioPlugin.send(`Current date: ${new Date().toLocaleString()}`);
    }
  );
  
  // Register a handler for all messages
  stdioPlugin.onMessage((message) => {
    Logger.debug(`StdIO received: ${JSON.stringify(message)}`);
  });
  
  await service.startService();
  Logger.info('CLI service started. Type "help" for available commands.');
}

main().catch(console.error);
```

## Configuration

The StdIO Plugin can be configured with the following options:

```typescript
interface StdioPluginConfig {
  interactive?: boolean; // If true, start in interactive mode when no command is provided
  promptPrefix?: string; // Prefix for the interactive prompt
}
```

### Example Configuration

```typescript
{
  'msa-plugin-stdio': {
    interactive: true,        // Enable interactive mode
    promptPrefix: "myapp> "   // Custom prompt
  }
}
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

## API Reference

### addCommandHandler(command, description, builder, handler)

Register a command with the CLI:

```typescript
interface UserOptions {
  id: string;
  role?: string;
}

stdioPlugin.addCommandHandler<UserOptions>(
  'user <id>',
  'Get or manage user information',
  {
    id: {
      describe: 'User ID',
      type: 'string',
      demandOption: true
    },
    role: {
      describe: 'User role',
      type: 'string',
      choices: ['admin', 'user', 'guest']
    }
  },
  (argv) => {
    console.log(`User ID: ${argv.id}`);
    if (argv.role) {
      console.log(`Role: ${argv.role}`);
    }
  }
);
```

### send(message)

Output a message to the console:

```typescript
// Send a simple string
stdioPlugin.send("Operation completed successfully");

// Send a structured object (will be JSON.stringified)
stdioPlugin.send({
  status: "success",
  data: {
    id: "12345",
    name: "Example"
  }
});
```

### prompt(questions)

Ask interactive questions:

```typescript
async function askUserDetails() {
  const answers = await stdioPlugin.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What is your name?'
    },
    {
      type: 'list',
      name: 'theme',
      message: 'Choose a theme:',
      choices: ['light', 'dark', 'system']
    },
    {
      type: 'confirm',
      name: 'saveSettings',
      message: 'Save these settings?',
      default: true
    }
  ]);
  
  console.log('User details:', answers);
  return answers;
}
```

### startInteractiveInput()

Start interactive mode to continuously read user input:

```typescript
// Start interactive mode programmatically
stdioPlugin.startInteractiveInput();
```

### onMessage(handler)

Register a handler for all messages:

```typescript
stdioPlugin.onMessage((message) => {
  if (typeof message === 'string') {
    // Raw input line in interactive mode
    console.log(`Processing input: ${message}`);
  } else if (message.type === 'command') {
    // Command executed via parsed arguments
    console.log(`Command executed: ${message.command}`);
    console.log('Arguments:', message.arguments);
  }
});
```

## Command Line Usage

Once your application is built with the StdIO plugin, users can interact with it from the command line:

```bash
# Execute a command directly
node your-app.js greet "John" --enthusiastic

# Start in interactive mode
node your-app.js

# In interactive mode, you can type commands:
myapp> greet Jane -e
myapp> date
myapp> help
myapp> exit
```

## Advanced Usage

### Sub-commands

Create a command hierarchy with sub-commands:

```typescript
// Main command: database
stdioPlugin.addCommandHandler(
  'database',
  'Database management commands',
  {},
  () => {
    stdioPlugin.send('Use a sub-command: migrate, backup, restore');
  }
);

// Sub-command: database migrate
stdioPlugin.addCommandHandler(
  'database migrate',
  'Run database migrations',
  {
    env: {
      describe: 'Environment',
      type: 'string',
      choices: ['dev', 'test', 'prod'],
      default: 'dev'
    }
  },
  (argv) => {
    stdioPlugin.send(`Running migrations on ${argv.env} environment...`);
    // Migration logic
  }
);

// Another sub-command: database backup
stdioPlugin.addCommandHandler(
  'database backup',
  'Backup the database',
  {
    output: {
      describe: 'Output file',
      type: 'string',
      default: 'backup.sql'
    }
  },
  (argv) => {
    stdioPlugin.send(`Backing up database to ${argv.output}...`);
    // Backup logic
  }
);
```

### Interactive Multi-Step Workflows

Create interactive wizards for complex operations:

```typescript
async function deploymentWizard() {
  const projectInfo = await stdioPlugin.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:'
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Deployment environment:',
      choices: ['development', 'staging', 'production']
    }
  ]);
  
  stdioPlugin.send(`Deploying ${projectInfo.name} to ${projectInfo.environment}...`);
  
  // Ask for confirmation if production
  if (projectInfo.environment === 'production') {
    const confirmation = await stdioPlugin.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Production deployment requires approval. Continue?',
        default: false
      }
    ]);
    
    if (!confirmation.proceed) {
      stdioPlugin.send('Deployment cancelled.');
      return;
    }
  }
  
  // Additional configuration
  const deployConfig = await stdioPlugin.prompt([
    {
      type: 'checkbox',
      name: 'services',
      message: 'Select services to deploy:',
      choices: ['api', 'workers', 'frontend', 'database']
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version tag:',
      default: 'latest'
    }
  ]);
  
  stdioPlugin.send(`Deploying ${deployConfig.services.join(', ')} services with version ${deployConfig.version}`);
  // Deployment logic
}

// Register as command
stdioPlugin.addCommandHandler(
  'deploy',
  'Start deployment wizard',
  {},
  async () => {
    await deploymentWizard();
  }
);
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
