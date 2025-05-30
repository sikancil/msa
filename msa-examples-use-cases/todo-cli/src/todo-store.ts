import * as fs from 'fs';
import * as path from 'path';

// Define the path for todos.json in the project root (msa-examples-use-cases/todo-cli/todos.json)
// __dirname is src/, so ../ moves to project root.
const TODOS_FILE_PATH = path.join(__dirname, '..', 'todos.json');

export interface TodoItem {
  id: number;
  description: string;
  status: 'pending' | 'done';
}

export function loadTodos(): TodoItem[] {
  try {
    if (fs.existsSync(TODOS_FILE_PATH)) {
      const data = fs.readFileSync(TODOS_FILE_PATH, 'utf-8');
      return JSON.parse(data) as TodoItem[];
    }
    return [];
  } catch (error) {
    console.error('Error loading todos:', error);
    return []; // Return empty array on error
  }
}

export function saveTodos(todos: TodoItem[]): void {
  try {
    fs.writeFileSync(TODOS_FILE_PATH, JSON.stringify(todos, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving todos:', error);
  }
}

export function addTodo(description: string): TodoItem {
  const todos = loadTodos();
  const newId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1;
  const newTodo: TodoItem = {
    id: newId,
    description,
    status: 'pending',
  };
  todos.push(newTodo);
  saveTodos(todos);
  return newTodo;
}

export function listTodos(): TodoItem[] {
  return loadTodos();
}

export function markTaskDone(id: number): TodoItem | undefined {
  const todos = loadTodos();
  const todoIndex = todos.findIndex(t => t.id === id);
  if (todoIndex > -1) {
    todos[todoIndex].status = 'done';
    saveTodos(todos);
    return todos[todoIndex];
  }
  return undefined;
}

export function removeTask(id: number): boolean {
  let todos = loadTodos();
  const initialLength = todos.length;
  todos = todos.filter(t => t.id !== id);
  if (todos.length < initialLength) {
    saveTodos(todos);
    return true;
  }
  return false;
}

// Helper function for check.ts to clean up
export function deleteTodosFile(): void {
    try {
        if (fs.existsSync(TODOS_FILE_PATH)) {
            fs.unlinkSync(TODOS_FILE_PATH);
        }
    } catch (error) {
        console.error('Error deleting todos.json:', error);
    }
}
