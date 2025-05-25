import { Service, Logger, Message } from '@arifwidianto/msa-core';
import { StdioPlugin, StdioPluginConfig } from '@arifwidianto/msa-plugin-stdio';
import { ArgumentsCamelCase } from 'yargs';

// Define a type for the echo command arguments for clarity
interface EchoCommandArgs {
  textToEcho: string;
  // Yargs typically adds '_' and '$0'. We can include them if needed for strict typing,
  // but for simple cases, focusing on the expected arguments is often enough.
  // Example: _: (string | number)[]; '$0': string;
}

async function main() {
  Logger.info('Starting CLI Echo Tool...');

  // 1. Instantiate the Service
  const service = new Service();

  // 2. Instantiate the StdioPlugin
  const stdioPlugin = new StdioPlugin();

  // 3. Register the StdioPlugin with the service
  // PluginConfig for StdioPlugin can be used to configure interactive mode, prompt, etc.
  // For this simple echo tool, default behavior (non-interactive) is fine.
  const stdioConfig: StdioPluginConfig = { interactive: false }; 
  service.registerPlugin(stdioPlugin); // No specific config needed for registration itself

  // 4. Define the "echo" command
  stdioPlugin.addCommandHandler<EchoCommandArgs>(
    'echo <textToEcho>', // Command signature for yargs
    'Echoes the provided text back to the console.', // Command description
    (yargs) => { // Builder function for yargs options
      return yargs.positional('textToEcho', {
        describe: 'The text to echo',
        type: 'string',
      });
    },
    async (argv: ArgumentsCamelCase<EchoCommandArgs>) => { // Handler function
      if (argv.textToEcho) {
        // Use stdioPlugin.send() to output the result
        // The StdioPlugin's send method handles console.log
        await stdioPlugin.send(argv.textToEcho);
      } else {
        // Should be caught by yargs 'demandOption' if we make textToEcho required.
        // Or handle it defensively here.
        await stdioPlugin.send('Error: No text provided to echo.');
      }
    }
  );
  
  // 5. Optional: Set up onMessage handler (not strictly necessary if command handler does all work)
  // For this example, the command handler above directly uses stdioPlugin.send().
  // If we wanted the service's generic handler to do the work, it would look like this:
  // stdioPlugin.onMessage(async (message: Message) => {
  //   Logger.debug('StdioPlugin Message Handler received:', message);
  //   const msgPayload = message as any; // Cast because Message is unknown
  //   if (msgPayload.type === 'command' && msgPayload.command === 'echo <textToEcho>') {
  //     const args = msgPayload.arguments as ArgumentsCamelCase<EchoCommandArgs>;
  //     if (args.textToEcho) {
  //       await stdioPlugin.send(`From generic handler: ${args.textToEcho}`);
  //     }
  //   }
  // });


  // 6. Initialize and start the service
  try {
    // Pass plugin-specific configurations to initializeService
    await service.initializeService({
      [stdioPlugin.name]: stdioConfig 
    });
    await service.startService(); // This will trigger yargs parsing or interactive mode

    // For a CLI tool that processes args and exits, we might not need explicit stop/cleanup
    // unless it enters a long-running interactive mode or has resources to release.
    // Yargs typically makes the process exit after command execution unless interactive.
    // If interactive mode was true and started, service.stopService() would be needed for graceful exit.
    
    // If not interactive, the process will likely exit via yargs.
    // If interactive, it would wait for 'exit' or 'quit' in startInteractiveInput().
    // For this non-interactive example, we can let yargs manage process exit.
    // Logger.info('CLI Echo Tool finished or is in interactive mode.');

  } catch (error) {
    Logger.error('Failed to start or run the CLI Echo Tool:', error);
    process.exit(1);
  }
}

main().catch(error => {
  Logger.error('Unhandled error in main:', error);
  process.exit(1);
});
