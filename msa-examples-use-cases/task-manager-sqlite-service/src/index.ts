import { Service, Logger, PluginConfig, IPlugin } from '@arifwidianto/msa-core';
import { HttpPlugin, HttpMessagePayload } from '@arifwidianto/msa-plugin-http'; // Assuming HttpMessagePayload is exported if needed, or use express types
import * as TaskRepository from './task-repository';
import { Request, Response } from 'express'; // For typing route handlers

const HTTP_PORT = 3002; // Using a different port from the other example

async function main() {
  Logger.info('Starting Task Manager Service...');

  // Database should be initialized manually via `npm run db:init` before starting
  // This ensures schema is set up. For a production app, migrations would be handled.

  const service = new Service();
  const httpPlugin = new HttpPlugin();

  const httpConfig: PluginConfig = { port: HTTP_PORT };
  service.registerPlugin(httpPlugin);

  // --- API Endpoints ---

  // POST /tasks - Create a new task
  httpPlugin.registerRoute('post', '/tasks', async (req: Request, res: Response) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== 'string' || description.trim() === '') {
        return res.status(400).json({ error: 'Task description is required and must be a non-empty string.' });
      }
      const task = await TaskRepository.createTask(description.trim());
      res.status(201).json(task);
    } catch (error) {
      Logger.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task.' });
    }
  });

  // GET /tasks - Get all tasks
  httpPlugin.registerRoute('get', '/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await TaskRepository.getAllTasks();
      res.status(200).json(tasks);
    } catch (error) {
      Logger.error('Error getting all tasks:', error);
      res.status(500).json({ error: 'Failed to retrieve tasks.' });
    }
  });

  // GET /tasks/:id - Get a specific task by ID
  httpPlugin.registerRoute('get', '/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format.' });
      }
      const task = await TaskRepository.getTaskById(id);
      if (task) {
        res.status(200).json(task);
      } else {
        res.status(404).json({ error: `Task with ID ${id} not found.` });
      }
    } catch (error) {
      Logger.error(`Error getting task by ID ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve task.' });
    }
  });

  // PUT /tasks/:id - Update a task
  httpPlugin.registerRoute('put', '/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format.' });
      }
      const { description, status } = req.body;

      if (description !== undefined && (typeof description !== 'string' || description.trim() === '')) {
        return res.status(400).json({ error: 'Task description must be a non-empty string if provided.' });
      }
      if (status !== undefined && status !== 'pending' && status !== 'done') {
        return res.status(400).json({ error: "Task status must be either 'pending' or 'done' if provided." });
      }
      if (description === undefined && status === undefined) {
        return res.status(400).json({ error: 'No update data provided (description or status).' });
      }

      const updatedTask = await TaskRepository.updateTask(id, description?.trim(), status);
      if (updatedTask) {
        res.status(200).json(updatedTask);
      } else {
        res.status(404).json({ error: `Task with ID ${id} not found or no changes made.` });
      }
    } catch (error) {
      Logger.error(`Error updating task ID ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to update task.' });
    }
  });

  // DELETE /tasks/:id - Delete a task
  httpPlugin.registerRoute('delete', '/tasks/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format.' });
      }
      const success = await TaskRepository.deleteTask(id);
      if (success) {
        res.status(204).send(); // No content
      } else {
        res.status(404).json({ error: `Task with ID ${id} not found.` });
      }
    } catch (error) {
      Logger.error(`Error deleting task ID ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to delete task.' });
    }
  });
  
  // Optional: Generic handler for root or unhandled paths (if HttpPlugin's default isn't sufficient)
  // httpPlugin.onMessage((msg: Message) => {
  //   const payload = msg as unknown as HttpMessagePayload;
  //   if (!payload.response.headersSent) {
  //      payload.response.status(404).json({ message: "Task Manager Service: Endpoint not found." });
  //   }
  // });

  try {
    await service.initializeService({
      [httpPlugin.name]: httpConfig,
    });
    await service.startService(); // This will call listen on the HttpPlugin

    Logger.info(`Task Manager Service with HTTP API listening on port ${HTTP_PORT}`);
    Logger.info('Service started successfully.');

  } catch (error) {
    Logger.error('Failed to start the Task Manager service:', error);
    process.exit(1);
  }
}

main().catch(error => {
  Logger.error('Unhandled error in main execution (Task Manager):', error);
  process.exit(1);
});
