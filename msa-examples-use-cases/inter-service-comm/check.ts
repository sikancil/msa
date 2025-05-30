import { spawn, ChildProcess, execSync } from 'child_process';
import axios, { AxiosInstance } from 'axios';
import * as path from 'path';
import { setTimeout as delay } from 'timers/promises'; // For async delay

const USER_SERVICE_PORT = 3002;
const POST_SERVICE_PORT = 3003;
const HOST = 'localhost';
const SERVICE_READY_TIMEOUT = 15000; // 15 seconds for services to start
const REQUEST_TIMEOUT = 5000;

const userServicePath = path.join(__dirname, 'user-service');
const postServicePath = path.join(__dirname, 'post-service');
const userServiceScript = path.join(userServicePath, 'dist', 'index.js');
const postServiceScript = path.join(postServicePath, 'dist', 'index.js');

let userServiceProcess: ChildProcess | null = null;
let postServiceProcess: ChildProcess | null = null;
let overallSuccess = true;
let stepCounter = 1;

const apiClient: AxiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
  validateStatus: () => true, // Handle all status codes in tests
});

function logStep(message: string) {
  console.log(`\n--- Step ${stepCounter++}: ${message} ---`);
}

function startServiceProcess(name: string, scriptPath: string, cwd: string, readyLog: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    console.log(`Starting ${name}: node "${scriptPath}" in ${cwd}`);
    const process = spawn('node', [scriptPath], { cwd, detached: false });

    let serviceReady = false;
    const readyTimeout = setTimeout(() => {
      if (!serviceReady) {
        console.error(`${name} readiness timeout!`);
        try { process.kill(); } catch (e) { /* ignore */ }
        reject(new Error(`${name} readiness timeout.`));
      }
    }, SERVICE_READY_TIMEOUT);

    process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log(`[${name} STDOUT]: ${output.trim()}`);
      if (output.includes(readyLog)) {
        if (!serviceReady) {
          serviceReady = true;
          clearTimeout(readyTimeout);
          console.log(`${name} reported as ready.`);
          resolve(process);
        }
      }
    });

    process.stderr?.on('data', (data: Buffer) => {
      console.error(`[${name} STDERR]: ${data.toString().trim()}`);
    });

    process.on('error', (err) => {
      if (!serviceReady) {
        console.error(`Failed to start ${name}.`, err);
        clearTimeout(readyTimeout);
        reject(err);
      } else {
        console.error(`${name} error after start:`, err);
      }
    });

    process.on('close', (code) => {
      console.warn(`${name} exited with code ${code}`);
      if (!serviceReady) {
        clearTimeout(readyTimeout);
        reject(new Error(`${name} exited prematurely with code ${code}.`));
      }
    });
  });
}

function killProcess(processToKill: ChildProcess | null, name: string) {
  if (processToKill && processToKill.pid) {
    console.log(`Attempting to kill ${name} (PID: ${processToKill.pid})...`);
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${processToKill.pid} /T /F`);
      } else {
        process.kill(processToKill.pid, 'SIGTERM');
      }
      console.log(`Killed/Sent kill signal to ${name} ${processToKill.pid}.`);
    } catch (e: any) {
      console.error(`Error killing ${name}: ${e.message}`);
    }
  } else if (processToKill) {
      console.log(`${name} process exists but has no PID. Attempting general kill.`);
      processToKill.kill('SIGTERM');
  } else {
    console.log(`${name} already null.`);
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
    logStep("Start User Service");
    userServiceProcess = await startServiceProcess(
      'user-service', 
      userServiceScript, 
      userServicePath, 
      `User Service with HTTP API listening on port ${USER_SERVICE_PORT}`
    );

    logStep("Start Post Service");
    postServiceProcess = await startServiceProcess(
      'post-service',
      postServiceScript,
      postServicePath,
      `Post Service with HTTP API listening on port ${POST_SERVICE_PORT}`
    );
    
    // Give services a moment to fully stabilize after "ready" log
    await delay(2000); 

    logStep("Fetch post with ID 101 (Alice's post)");
    const response = await apiClient.get(`http://${HOST}:${POST_SERVICE_PORT}/posts/101`);
    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(response.data, null, 2));
    
    await check(
      response.status === 200 &&
      response.data &&
      response.data.id === 101 &&
      response.data.title === "Alice's First Post" &&
      response.data.user &&
      response.data.user.id === 1 &&
      response.data.user.name === "Alice",
      "Fetched post 101 with correct enriched user data.",
      `Fetching post 101 failed or data mismatch. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`
    );

  } catch (error) {
    console.error('Error during check script execution:', error instanceof Error ? error.message : error);
    overallSuccess = false;
  } finally {
    logStep("Stop Services");
    killProcess(postServiceProcess, 'post-service');
    killProcess(userServiceProcess, 'user-service');
    
    // A small delay to allow processes to terminate before script exits
    await delay(1000);

    if (overallSuccess) {
      console.log("\n✅ All Inter-Service Communication checks PASSED!");
      process.exit(0);
    } else {
      console.error("\n❌ Some Inter-Service Communication checks FAILED.");
      process.exit(1);
    }
  }
}

// Handle unhandled rejections and uncaught exceptions for the check script itself
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  killProcess(postServiceProcess, 'post-service');
  killProcess(userServiceProcess, 'user-service');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  killProcess(postServiceProcess, 'post-service');
  killProcess(userServiceProcess, 'user-service');
  process.exit(1);
});

runChecks();
