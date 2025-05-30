import { spawn, ChildProcess, execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import path from 'path';
import fs from 'fs';

const HTTP_PORT = 3002; // Must match the port in src/index.ts
const HOST = 'localhost';
const BASE_URL = `http://${HOST}:${HTTP_PORT}`;
const SERVICE_READY_TIMEOUT = 15000; // Increased timeout for service to start
const REQUEST_TIMEOUT = 5000;

const projectRoot = path.join(__dirname, '..');
const serviceScriptPath = path.join(projectRoot, 'dist', 'index.js');
const dbPath = path.join(projectRoot, 'tasks.db');
const dbInitScriptPath = path.join(__dirname, 'db-init.ts'); // Assuming it's in src

let serviceProcess: ChildProcess | null = null;
let overallSuccess = true;
let stepCounter = 1;

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  validateStatus: () => true, // Handle all status codes in tests
});

function logStep(message: string) {
  console.log(`\n--- Step ${stepCounter++}: ${message} ---`);
}

function executeCommand(command: string, options?: ExecSyncOptionsWithStringEncoding) {
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(command, { ...options, encoding: 'utf8', stdio: 'pipe' });
    console.log(output.trim());
    return true;
  } catch (error: any) {
    console.error(`Command failed: ${command}`);
    if (error.stdout) console.error('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    return false;
  }
}

async function cleanupDatabase() {
  console.log('Cleaning up database file...');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('tasks.db deleted.');
  }
}

async function initializeDatabase() {
  logStep("Initialize Database");
  if (!executeCommand(`ts-node "${dbInitScriptPath}"`)) {
    throw new Error('Database initialization script failed.');
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file tasks.db was not created by db-init script.');
  }
  console.log('Database initialized successfully.');
}

async function startService(): Promise<void> {
  return new Promise((resolve, reject) => {
    logStep(`Starting service: node "${serviceScriptPath}"`);
    serviceProcess = spawn('node', [serviceScriptPath], { detached: false });

    let serviceReady = false;
    const readyTimeout = setTimeout(() => {
      if (!serviceReady) {
        console.error('Service readiness timeout!');
        killService();
        reject(new Error('Service readiness timeout.'));
      }
    }, SERVICE_READY_TIMEOUT);

    serviceProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(`[Service STDOUT]: ${output.trim()}`);
      if (output.includes(`Task Manager Service with HTTP API listening on port ${HTTP_PORT}`)) {
        if (!serviceReady) {
          serviceReady = true;
          clearTimeout(readyTimeout);
          console.log('Service reported as ready.');
          resolve();
        }
      }
    });

    serviceProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[Service STDERR]: ${data.toString().trim()}`);
    });

    serviceProcess.on('error', (err) => {
      if (!serviceReady) { // Only reject if not already resolved
        console.error('Failed to start service process.', err);
        clearTimeout(readyTimeout);
        reject(err);
      } else {
        console.error('Service process error after start:', err);
      }
    });

    serviceProcess.on('close', (code) => {
      console.warn(`Service process exited with code ${code}`);
      if (!serviceReady) { // If it closes before ready
        clearTimeout(readyTimeout);
        reject(new Error(`Service process exited prematurely with code ${code}.`));
      }
    });
  });
}

function killService() {
  if (serviceProcess && serviceProcess.pid) {
    console.log(`Attempting to kill service process (PID: ${serviceProcess.pid})...`);
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${serviceProcess.pid} /T /F`);
      } else {
        process.kill(serviceProcess.pid, 'SIGTERM'); // More graceful first
        // Consider process.kill(-serviceProcess.pid, 'SIGTERM'); if detached and group leader
      }
      console.log(`Killed/Sent kill signal to service process ${serviceProcess.pid}.`);
    } catch (e: any) {
      console.error(`Error killing process: ${e.message}`);
    }
    serviceProcess = null;
  } else if (serviceProcess) {
      console.log('Service process exists but has no PID. Attempting general kill.');
      serviceProcess.kill('SIGTERM');
  } else {
    console.log('Service process already null.');
  }
}

async function check(condition: boolean, successMessage: string, failureMessage: string): Promise<void> {
  if (condition) {
    console.log(`✅ PASSED: ${successMessage}`);
  } else {
    console.error(`❌ FAILED: ${failureMessage}`);
    overallSuccess = false;
  }
}

async function runChecks() {
  try {
    await cleanupDatabase(); // Start clean
    await initializeDatabase(); // Initialize DB schema
    await startService();     // Start the main service

    // --- Test CRUD Operations ---
    let taskId: number | null = null;

    logStep("Create a new task");
    let response = await apiClient.post('/tasks', { description: 'Test Task 1' });
    await check(response.status === 201 && response.data && response.data.id && response.data.description === 'Test Task 1' && response.data.status === 'pending',
                'Task created successfully.', `Task creation failed. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
    if (response.data && response.data.id) taskId = response.data.id;

    logStep("Get all tasks - expecting one task");
    if (taskId) {
      response = await apiClient.get('/tasks');
      await check(response.status === 200 && Array.isArray(response.data) && response.data.length === 1 && response.data[0].id === taskId,
                  'Fetched all tasks, one task found.', `Fetching all tasks failed or task not found. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
    } else {
      console.error("❌ SKIPPED: Cannot get all tasks because task creation failed or ID not returned.");
      overallSuccess = false;
    }
    
    logStep("Get specific task by ID");
    if (taskId) {
      response = await apiClient.get(`/tasks/${taskId}`);
      await check(response.status === 200 && response.data && response.data.id === taskId && response.data.description === 'Test Task 1',
                  'Fetched specific task successfully.', `Fetching specific task failed. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
    } else {
      console.error("❌ SKIPPED: Cannot get task by ID because task creation failed or ID not returned.");
      overallSuccess = false;
    }

    logStep("Update the task");
    if (taskId) {
      response = await apiClient.put(`/tasks/${taskId}`, { description: 'Updated Test Task 1', status: 'done' });
      await check(response.status === 200 && response.data && response.data.id === taskId && response.data.description === 'Updated Test Task 1' && response.data.status === 'done',
                  'Task updated successfully.', `Task update failed. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
    } else {
      console.error("❌ SKIPPED: Cannot update task because task creation failed or ID not returned.");
      overallSuccess = false;
    }

    logStep("Get specific task by ID (after update)");
     if (taskId) {
      response = await apiClient.get(`/tasks/${taskId}`);
      await check(response.status === 200 && response.data && response.data.id === taskId && response.data.description === 'Updated Test Task 1' && response.data.status === 'done',
                  'Fetched updated specific task successfully.', `Fetching updated specific task failed. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
    } else {
      console.error("❌ SKIPPED: Cannot get updated task by ID because task creation failed or ID not returned.");
      overallSuccess = false;
    }

    logStep("Delete the task");
    if (taskId) {
      response = await apiClient.delete(`/tasks/${taskId}`);
      await check(response.status === 204, 'Task deleted successfully.', `Task deletion failed. Status: ${response.status}`);
    } else {
      console.error("❌ SKIPPED: Cannot delete task because task creation failed or ID not returned.");
      overallSuccess = false;
    }

    logStep("Get specific task by ID (after delete) - expecting 404");
    if (taskId) {
      response = await apiClient.get(`/tasks/${taskId}`);
      await check(response.status === 404, 'Getting deleted task returned 404 as expected.', `Getting deleted task failed. Status: ${response.status}`);
    } else {
      console.error("❌ SKIPPED: Cannot get deleted task by ID because task creation failed or ID not returned.");
      overallSuccess = false;
    }
    
    logStep("Get all tasks - expecting zero tasks");
    response = await apiClient.get('/tasks');
    await check(response.status === 200 && Array.isArray(response.data) && response.data.length === 0,
                'Fetched all tasks, zero tasks found.', `Fetching all tasks failed or list not empty. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);


  } catch (error) {
    console.error('Error during check script execution:', error instanceof Error ? error.message : error);
    overallSuccess = false;
  } finally {
    killService();
    await cleanupDatabase(); // Final cleanup of DB
    if (overallSuccess) {
      console.log("\n✅ All Task Manager checks PASSED!");
      process.exit(0);
    } else {
      console.error("\n❌ Some Task Manager checks FAILED.");
      process.exit(1);
    }
  }
}

process.on('SIGINT', () => {
  console.log('SIGINT received in check script. Cleaning up...');
  killService();
  cleanupDatabase().finally(() => process.exit(130));
});

runChecks();
