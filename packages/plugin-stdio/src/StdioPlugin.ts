import { IPlugin, PluginConfig, Logger, ITransport, Message, MessageHandler } from '@arifwidianto/msa-core';
import yargs, { Argv, CommandModule, ArgumentsCamelCase } from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer, { QuestionCollection, Answers } from 'inquirer';
import { StdioPluginConfig } from './StdioPluginConfig';
import readline from 'readline';

export class StdioPlugin implements IPlugin, ITransport {
  public readonly name = 'msa-plugin-stdio';
  public readonly version = '0.1.0';
  public readonly dependencies: string[] = [];

  private config: StdioPluginConfig = {};
  private messageHandler: MessageHandler | null = null;
  private yargsInstance: Argv | null = null;
  private commandHandlers: Map<string, (args: ArgumentsCamelCase<any>) => void> = new Map();
  private isInteractiveListening: boolean = false;
  private rl: readline.Interface | null = null;

  public async initialize(config: PluginConfig): Promise<void> {
    this.config = { ...this.config, ...config } as StdioPluginConfig;
    this.yargsInstance = yargs(hideBin(process.argv));
    this.setupDefaultYargs();
    Logger.info(`StdIO Plugin "${this.name}" initialized with config: ${JSON.stringify(this.config)}`);
  }

  private setupDefaultYargs(): void {
    if (!this.yargsInstance) return;

    this.yargsInstance
      .scriptName("msa-cli") // Or a configurable name
      .usage('$0 <cmd> [args]')
      .help('h')
      .alias('h', 'help')
      .alias('v', 'version') // yargs handles version from package.json if linked properly
      .demandCommand(0, 'You need at least one command before moving on, or run in interactive mode.')
      .strict() // Catches unknown commands
      .fail((msg, err, yargs) => { // Custom failure function
        if (err) throw err; // Preserve stack
        Logger.error(`CLI Error: ${msg}`);
        yargs.showHelp();
        // If interactive mode is desired on failure, can be triggered here
      });
  }

  public async start(): Promise<void> {
    if (!this.yargsInstance) {
      throw new Error('StdIO Plugin: Not initialized. Call initialize() first.');
    }

    // Register all command handlers with yargs
    this.commandHandlers.forEach((handler, commandKey) => {
        // Assuming commandKey is "command" or "command sub"
        const [cmd, ...subcommands] = commandKey.split(' ');
        const commandModule: CommandModule = {
            command: commandKey, // Full command string
            aliases: [], // Can be configured via addCommandHandler
            describe: `Handler for ${commandKey}`, // Can be configured
            handler: (args) => {
                if (this.messageHandler) {
                    // Pass command output or args to the generic message handler
                    this.messageHandler({ command: commandKey, args } as any);
                }
                handler(args); // Execute specific command handler
            },
            // builder: (y) => y.option(...) // Can be configured
        };
        // This way of adding commands is a bit simplistic for complex subcommands with yargs
        // A more robust approach would be to allow passing full CommandModule objects
        this.yargsInstance!.command(commandModule);
    });
    
    // If no command is given and interactive mode is enabled by config, or if an 'interactive' command is explicitly run.
    const argv = await this.yargsInstance.parseAsync();

    if (argv._.length === 0 && this.config.interactive) {
      Logger.info('No command provided. Starting interactive mode (if configured).');
      this.startInteractiveInput();
    } else if (argv._.length === 0 && !this.config.interactive) {
       // No command and not interactive, show help.
       this.yargsInstance.showHelp();
    }
    // If a command was matched by yargs, its handler would have been called.
    // The process will typically exit after yargs completes, unless interactive mode keeps it alive.
  }

  public async stop(): Promise<void> {
    Logger.info(`StdIO Plugin "${this.name}" stopping...`);
    this.isInteractiveListening = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
      Logger.info('Interactive input stopped.');
    }
    // For yargs, there isn't a "stop" in the server sense.
  }

  public async cleanup(): Promise<void> {
    this.yargsInstance = null;
    this.commandHandlers.clear();
    Logger.info(`StdIO Plugin "${this.name}" cleaned up.`);
  }

  // --- ITransport Implementation ---

  public async listen(): Promise<void> {
    // "listen" for StdIO means being ready to process commands or interactive input.
    // This is effectively handled by start().
    Logger.info('StdIO Plugin: listen() called. Command processing will start via start(). Interactive mode may also start if configured.');
    // If interactive mode is desired by default, it can be triggered here or in start().
    if (this.config.interactive && !this.isInteractiveListening) {
        // this.startInteractiveInput(); // Or defer to start()
    }
  }

  public async send(message: Message): Promise<void> {
    if (typeof message === 'object' && message !== null) {
      console.log(JSON.stringify(message, null, 2)); // Pretty print objects
    } else {
      console.log(message);
    }
    return Promise.resolve();
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    Logger.info('StdIO Plugin: Generic message handler registered. It will receive parsed commands or interactive input.');
  }

  public async close(): Promise<void> {
    await this.stop();
  }

  // --- StdIO Specific Methods ---

  /**
   * Adds a command handler that yargs will use.
   * @param command The command string (e.g., "greet <name> [options]")
   * @param description A description for the command (for help text)
   * @param builder Yargs builder function or object for options (e.g., { name: { describe: 'Your name', type: 'string', demandOption: true } })
   * @param handler The function to execute when the command is matched.
   */
  public addCommandHandler<T = {}>(
    command: string,
    description: string,
    builder: Record<string, yargs.Options> | ((y: Argv) => Argv<T>),
    handler: (argv: ArgumentsCamelCase<T>) => void
  ): void {
    if (!this.yargsInstance) {
      Logger.warn('StdIO Plugin: Yargs not initialized. Cannot add command handler yet.');
      // Could queue these if initialize is called later, or throw error
      return;
    }

    const commandModule: CommandModule<T, T> = {
      command,
      describe: description,
      builder: builder as any, // Type assertion needed due to complex yargs types
      handler: (args) => {
        // If a global message handler is registered, notify it
        if (this.messageHandler) {
          try {
            // We construct a "Message" like object. This can be standardized.
            const messagePayload: Message = { type: 'command', command, arguments: args };
            this.messageHandler(messagePayload);
          } catch (e) {
            Logger.error(`Error in global message handler for command ${command}: ${e}`);
          }
        }
        // Execute the specific handler for this command
        handler(args);
      },
    };

    this.yargsInstance.command(commandModule);
    Logger.info(`StdIO Plugin: Command handler added for "${command}"`);
  }


  /**
   * Prompts the user with a set of questions using Inquirer.
   * @param questions The Inquirer question collection.
   * @returns A promise that resolves with the user's answers.
   */
  public async prompt(questions: QuestionCollection): Promise<Answers> {
    return inquirer.prompt(questions);
  }

  /**
   * Starts an interactive loop that reads lines from stdin.
   * Each line entered can be processed as a command or passed to the message handler.
   */
  public startInteractiveInput(): void {
    if (this.isInteractiveListening || this.rl) {
      Logger.info('Interactive input is already active.');
      return;
    }
    this.isInteractiveListening = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.config.promptPrefix || '> '
    });

    Logger.info(`StdIO Plugin: Starting interactive input. Type 'exit' or 'quit' to stop. Press Ctrl+C to force exit.`);
    this.rl.prompt();

    this.rl.on('line', async (line: string) => {
      const trimmedLine = line.trim();
      if (trimmedLine.toLowerCase() === 'exit' || trimmedLine.toLowerCase() === 'quit') {
        await this.stop(); // Gracefully stop listening
        return;
      }

      if (this.messageHandler) {
        try {
          // Treat line as a message. Could also try to parse it with yargs.
           this.messageHandler(trimmedLine as Message); // Or { type: 'interactive_input', content: trimmedLine }
        } catch (error) {
          Logger.error(`StdIO Plugin: Error in message handler for interactive input: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        Logger.info(`Received input: ${trimmedLine}. No global message handler registered for interactive lines.`);
      }
      if (this.isInteractiveListening) this.rl?.prompt(); // Keep prompting if still active
    });

    this.rl.on('close', () => {
      Logger.info('StdIO Plugin: Interactive input stream closed.');
      this.isInteractiveListening = false;
      this.rl = null;
      // Potentially trigger a graceful shutdown of the service if desired
    });
  }
}
