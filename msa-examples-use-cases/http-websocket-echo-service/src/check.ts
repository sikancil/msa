import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import WebSocket from 'ws';
import path from 'path';

const HTTP_PORT = 3000;
const WS_PORT = 3001;
const HOST = 'localhost';
const SERVICE_READY_TIMEOUT = 10000; // 10 seconds for service to start
const WS_MESSAGE_TIMEOUT = 5000; // 5 seconds for WebSocket message roundtrip

// Determine the path to the compiled index.js
const projectRoot = path.join(__dirname, '..'); // Moves from src to project root
const serviceScriptPath = path.join(projectRoot, 'dist', 'index.js');

let serviceProcess: ChildProcess | null = null;
let overallSuccess = true;

async function startService(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Starting service: node "${serviceScriptPath}"`);
    serviceProcess = spawn('node', [serviceScriptPath], {
      // cwd: projectRoot, // if needed, but script path is absolute
      detached: false, // Make it true if you want to kill by group
    });

    let stdoutData = '';
    let stderrData = '';
    let httpReady = false;
    let wsReady = false;

    const readyTimeout = setTimeout(() => {
      if (!httpReady || !wsReady) {
        console.error('Service readiness timeout!');
        killService();
        reject(new Error('Service readiness timeout.'));
      }
    }, SERVICE_READY_TIMEOUT);

    const checkReady = () => {
      if (httpReady && wsReady) {
        clearTimeout(readyTimeout);
        console.log('Service reported as ready.');
        resolve();
      }
    };

    serviceProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      stdoutData += output;
      console.log(`[Service STDOUT]: ${output.trim()}`);
      if (output.includes(`HTTP Echo Service listening on port ${HTTP_PORT}`)) {
        httpReady = true;
        checkReady();
      }
      if (output.includes(`WebSocket Echo Service listening on port ${WS_PORT}`)) {
        wsReady = true;
        checkReady();
      }
    });

    serviceProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      stderrData += output;
      console.error(`[Service STDERR]: ${output.trim()}`);
    });

    serviceProcess.on('error', (err) => {
      console.error('Failed to start service process.', err);
      clearTimeout(readyTimeout);
      reject(err);
    });

    serviceProcess.on('close', (code) => {
      if (code !== 0 && code !== null) { // Null if killed
        console.warn(`Service process exited with code ${code}`);
        if (!httpReady || !wsReady) { // If not ready by the time it closes unexpectedly
            clearTimeout(readyTimeout);
            reject(new Error(`Service process exited prematurely with code ${code}. STDERR: ${stderrData} STDOUT: ${stdoutData}`));
        }
      }
    });
  });
}

async function checkHttp(): Promise<boolean> {
  const testMessage = 'hellohttp';
  const url = `http://${HOST}:${HTTP_PORT}/echo/${testMessage}`;
  console.log(`\n--- HTTP Check ---`);
  console.log(`Requesting ${url}`);
  try {
    const response = await axios.get(url, { timeout: WS_MESSAGE_TIMEOUT });
    if (response.status === 200 && response.data && response.data.echo === testMessage) {
      console.log(`HTTP Check PASSED. Received: ${JSON.stringify(response.data)}`);
      return true;
    } else {
      console.error(`HTTP Check FAILED. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.error('HTTP Check FAILED with error:', error instanceof Error ? error.message : error);
    return false;
  }
}

async function checkWebSocket(): Promise<boolean> {
  const url = `ws://${HOST}:${WS_PORT}`;
  const testMessage = 'hellows';
  let success = false;
  console.log(`\n--- WebSocket Check ---`);
  console.log(`Connecting to ${url}`);

  return new Promise((resolve) => {
    const ws = new WebSocket(url, { timeout: WS_MESSAGE_TIMEOUT });

    const wsTimeout = setTimeout(() => {
      console.error('WebSocket Check FAILED: Message timeout.');
      ws.terminate(); // Close the connection on timeout
      overallSuccess = false; // Mark overall as failed
      resolve(false);
    }, WS_MESSAGE_TIMEOUT);

    ws.on('open', () => {
      console.log('WebSocket connected. Sending message:', testMessage);
      ws.send(testMessage);
    });

    ws.on('message', (data: RawData) => {
      const receivedMessage = data.toString();
      console.log(`WebSocket received: "${receivedMessage}"`);
      if (receivedMessage === testMessage) {
        console.log('WebSocket Check PASSED.');
        success = true;
      } else {
        console.error(`WebSocket Check FAILED. Expected: "${testMessage}", Actual: "${receivedMessage}"`);
      }
      clearTimeout(wsTimeout);
      ws.close();
      resolve(success);
    });

    ws.on('error', (err) => {
      console.error('WebSocket Check FAILED with error:', err.message);
      clearTimeout(wsTimeout);
      overallSuccess = false; // Mark overall as failed for connection errors too
      resolve(false);
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reason.toString() || 'N/A'}`);
        clearTimeout(wsTimeout); // Ensure timeout is cleared if close happens before message
        if (!success) { // If not already resolved as success (e.g. due to error or timeout)
             resolve(success); // Resolve with current success state
        }
    });
  });
}

function killService() {
  if (serviceProcess) {
    console.log(`Attempting to kill service process (PID: ${serviceProcess.pid})...`);
    // For Windows, taskkill is more reliable for spawned processes
    if (process.platform === "win32") {
        if (serviceProcess.pid) {
            try {
                execSync(`taskkill /PID ${serviceProcess.pid} /T /F`);
                console.log(`Killed service process ${serviceProcess.pid} using taskkill.`);
            } catch (e: any) {
                console.error(`Error killing process with taskkill: ${e.message}`);
            }
        }
    } else {
        // For Linux/macOS, sending SIGTERM. If detached, use process group.
        // Since detached is false, serviceProcess.kill() should work.
        const killed = serviceProcess.kill('SIGTERM'); // or 'SIGKILL'
        if (killed) {
            console.log('Sent SIGTERM to service process.');
        } else {
            console.warn('Failed to send SIGTERM to service process (it might have already exited).');
        }
    }
    serviceProcess = null;
  }
}

async function runChecks() {
  try {
    await startService();

    const httpResult = await checkHttp();
    if (!httpResult) overallSuccess = false;

    const wsResult = await checkWebSocket();
    if (!wsResult) overallSuccess = false;

  } catch (error) {
    console.error('Error during check execution:', error instanceof Error ? error.message : error);
    overallSuccess = false;
  } finally {
    killService();
    if (overallSuccess) {
      console.log("\n✅ All checks PASSED!");
      process.exit(0);
    } else {
      console.error("\n❌ Some checks FAILED.");
      process.exit(1);
    }
  }
}

// Handle unhandled rejections and uncaught exceptions for the check script itself
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  killService();
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  killService();
  process.exit(1);
});

runChecks();
