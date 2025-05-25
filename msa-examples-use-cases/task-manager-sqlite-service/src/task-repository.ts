import db from './db'; // The promisified db instance
import { Logger } from '@arifwidianto/msa-core';

export interface Task {
  id: number;
  description: string;
  status: 'pending' | 'done';
}

export async function createTask(description: string): Promise<Task> {
  const sql = `INSERT INTO tasks (description, status) VALUES (?, ?)`;
  try {
    const result = await db.runAsync(sql, description, 'pending');
    if (result.id !== undefined) {
        return { id: result.id, description, status: 'pending' };
    } else {
        // This case should ideally not happen if SQLite AUTOINCREMENT works as expected
        Logger.error('Task creation succeeded but ID was not returned.', { description });
        throw new Error('Task creation succeeded but ID was not returned.');
    }
  } catch (error) {
    Logger.error('Error creating task in repository:', error);
    throw error; // Re-throw to be handled by service layer
  }
}

export async function getAllTasks(): Promise<Task[]> {
  const sql = `SELECT * FROM tasks`;
  try {
    const rows = await db.allAsync<Task>(sql);
    return rows;
  } catch (error) {
    Logger.error('Error getting all tasks from repository:', error);
    throw error;
  }
}

export async function getTaskById(id: number): Promise<Task | null> {
  const sql = `SELECT * FROM tasks WHERE id = ?`;
  try {
    const row = await db.getAsync<Task>(sql, id);
    return row || null;
  } catch (error) {
    Logger.error(`Error getting task by ID ${id} from repository:`, error);
    throw error;
  }
}

export async function updateTask(id: number, description?: string, status?: 'pending' | 'done'): Promise<Task | null> {
  if (description === undefined && status === undefined) {
    Logger.warn(`Update task called for ID ${id} without description or status.`);
    return getTaskById(id); // No changes to make, return current task
  }

  const fieldsToUpdate: string[] = [];
  const params: (string | number)[] = [];

  if (description !== undefined) {
    fieldsToUpdate.push('description = ?');
    params.push(description);
  }
  if (status !== undefined) {
    fieldsToUpdate.push('status = ?');
    params.push(status);
  }
  params.push(id); // For the WHERE clause

  const sql = `UPDATE tasks SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

  try {
    const result = await db.runAsync(sql, ...params);
    if (result.changes > 0) {
      return getTaskById(id); // Return the updated task
    }
    return null; // No rows updated, task probably not found
  } catch (error) {
    Logger.error(`Error updating task ID ${id} in repository:`, error);
    throw error;
  }
}

export async function deleteTask(id: number): Promise<boolean> {
  const sql = `DELETE FROM tasks WHERE id = ?`;
  try {
    const result = await db.runAsync(sql, id);
    return result.changes > 0; // True if a row was deleted
  } catch (error) {
    Logger.error(`Error deleting task ID ${id} from repository:`, error);
    throw error;
  }
}
