import { Service, Logger, Message, PluginConfig, IPlugin } from '@arifwidianto/msa-core';
import { StdioPlugin, StdioPluginConfig } from '@arifwidianto/msa-plugin-stdio';
import { ArgumentsCamelCase } from 'yargs';
import * as TodoStore from './todo-store'; // Import all functions from todo-store

// Define argument types for commands
interface AddTaskArgs {
  description: string[]; // Yargs collects variadic positional args into an array
}

interface TaskIdArgs {
  id: number;
}

async function main() {
  Logger.info('Starting Todo CLI Tool...');

  const service = new Service();
  const stdioPlugin = new StdioPlugin();
  
  const stdioConfig: StdioPluginConfig = { 
    interactive: false, // Typically CLIs with subcommands are not interactive by default
    promptPrefix: 'todo> ' // Only relevant if interactive mode was enabled
  };
  
  service.registerPlugin(stdioPlugin);

  // --- Add Command ---
  stdioPlugin.addCommandHandler<AddTaskArgs>(
    'add <description...>',
    'Add a new todo task.',
    (yargs) => yargs.positional('description', {
      describe: 'The description of the task',
      type: 'string',
      demandOption: true, 
    }),
    async (argv) => {
      const description = argv.description.join(' ');
      const newTodo = TodoStore.addTodo(description);
      await stdioPlugin.send(`Added: [${newTodo.id}] ${newTodo.description} (pending)`);
    }
  );

  // --- List Command ---
  stdioPlugin.addCommandHandler(
    'list',
    'List all todo tasks.',
    {}, // No specific builder options for list
    async () => {
      const todos = TodoStore.listTodos();
      if (todos.length === 0) {
        await stdioPlugin.send('No tasks found.');
        return;
      }
      todos.forEach(todo => {
        stdioPlugin.send(`[${todo.id}] ${todo.description} (${todo.status})`);
      });
    }
  );

  // --- Done Command ---
  stdioPlugin.addCommandHandler<TaskIdArgs>(
    'done <id>',
    'Mark a task as done.',
    (yargs) => yargs.positional('id', {
      describe: 'The ID of the task to mark as done',
      type: 'number',
      demandOption: true,
    }),
    async (argv) => {
      const updatedTodo = TodoStore.markTaskDone(argv.id);
      if (updatedTodo) {
        await stdioPlugin.send(`Marked done: [${updatedTodo.id}] ${updatedTodo.description}`);
      } else {
        await stdioPlugin.send(`Error: Task with ID ${argv.id} not found.`);
      }
    }
  );

  // --- Remove Command ---
  stdioPlugin.addCommandHandler<TaskIdArgs>(
    'remove <id>',
    'Remove a task.',
    (yargs) => yargs.positional('id', {
      describe: 'The ID of the task to remove',
      type: 'number',
      demandOption: true,
    }),
    async (argv) => {
      const success = TodoStore.removeTask(argv.id);
      if (success) {
        await stdioPlugin.send(`Removed task with ID ${argv.id}.`);
      } else {
        await stdioPlugin.send(`Error: Task with ID ${argv.id} not found or already removed.`);
      }
    }
  );

  try {
    await service.initializeService({
      [stdioPlugin.name]: stdioConfig
    });
    await service.startService(); // This will trigger yargs parsing
  } catch (error) {
    Logger.error('Failed to start or run the Todo CLI Tool:', error);
    process.exit(1);
  }
}

main().catch(error => {
  Logger.error('Unhandled error in main execution (Todo CLI):', error);
  process.exit(1);
});
