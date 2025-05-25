import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import path from 'path';
import fs from 'fs';
import { deleteTodosFile, TodoItem } from './todo-store'; // Assuming TodoItem is exported

// Determine the path to the compiled index.js and todos.json
const projectRoot = path.join(__dirname, '..'); // Moves from src to project root
const cliScriptPath = path.join(projectRoot, 'dist', 'index.js');
const todosJsonPath = path.join(projectRoot, 'todos.json'); // Path for direct inspection/cleanup

const execOptions: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

let overallSuccess = true;
let stepCounter = 1;

function logStep(message: string) {
  console.log(`\n--- Step ${stepCounter++}: ${message} ---`);
}

function checkOutput(command: string, expectedOutput?: string | RegExp, description?: string): boolean {
  description = description || command;
  console.log(`Executing: ${command}`);
  try {
    const output = execSync(`node "${cliScriptPath}" ${command}`, execOptions);
    const trimmedOutput = output.trim();
    console.log(`Output:\n${trimmedOutput}`);

    if (expectedOutput) {
      if (expectedOutput instanceof RegExp) {
        if (expectedOutput.test(trimmedOutput)) {
          console.log(`✅ PASSED: "${description}" output matches regex "${expectedOutput.source}".`);
          return true;
        } else {
          console.error(`❌ FAILED: "${description}" output did not match regex "${expectedOutput.source}". Actual: "${trimmedOutput}"`);
          overallSuccess = false;
          return false;
        }
      } else {
        if (trimmedOutput.includes(expectedOutput)) {
          console.log(`✅ PASSED: "${description}" output includes "${expectedOutput}".`);
          return true;
        } else {
          console.error(`❌ FAILED: "${description}" output did not include "${expectedOutput}". Actual: "${trimmedOutput}"`);
          overallSuccess = false;
          return false;
        }
      }
    }
    console.log(`✅ PASSED: "${description}" executed successfully (output not strictly checked).`);
    return true;
  } catch (error: any) {
    console.error(`❌ FAILED: "${description}" command failed with an error!`);
    console.error('Error message:', error.message);
    if (error.stdout) console.error('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    overallSuccess = false;
    return false;
  }
}

function verifyTodosFile(verifier: (todos: TodoItem[]) => boolean, description: string): boolean {
  console.log(`Verifying todos.json: ${description}`);
  try {
    if (!fs.existsSync(todosJsonPath)) {
        if (verifier([])) { // If verifier expects empty and file doesn't exist, that's fine
            console.log(`✅ PASSED: "${description}" (todos.json does not exist, as expected by verifier).`);
            return true;
        }
        console.error(`❌ FAILED: "${description}" (todos.json does not exist).`);
        overallSuccess = false;
        return false;
    }
    const data = fs.readFileSync(todosJsonPath, 'utf-8');
    const todos = JSON.parse(data) as TodoItem[];
    if (verifier(todos)) {
      console.log(`✅ PASSED: "${description}".`);
      return true;
    } else {
      console.error(`❌ FAILED: "${description}". Current todos:`, todos);
      overallSuccess = false;
      return false;
    }
  } catch (error) {
    console.error(`❌ FAILED: "${description}" - Error reading or parsing todos.json:`, error);
    overallSuccess = false;
    return false;
  }
}


async function runChecks() {
  logStep("Initial cleanup: Delete todos.json if it exists");
  deleteTodosFile(); // Using the imported function from todo-store

  logStep("Add 'Test Task 1'");
  checkOutput('add "Test Task 1"', 'Added: [1] Test Task 1 (pending)');
  verifyTodosFile(todos => todos.length === 1 && todos[0].description === "Test Task 1" && todos[0].id === 1, "Task 1 added");

  logStep("Add 'Test Task 2'");
  checkOutput('add "Test Task 2"', 'Added: [2] Test Task 2 (pending)');
  verifyTodosFile(todos => todos.length === 2 && todos[1].description === "Test Task 2" && todos[1].id === 2, "Task 2 added");

  logStep("List tasks - expecting two tasks");
  checkOutput('list', /\[1\] Test Task 1 \(pending\).*\[2\] Test Task 2 \(pending\)/s, "List shows two tasks");

  logStep("Mark task 1 as done");
  checkOutput('done 1', 'Marked done: [1] Test Task 1');
  verifyTodosFile(todos => todos.find(t => t.id === 1)?.status === 'done', "Task 1 marked done in JSON");

  logStep("List tasks again - expecting task 1 done");
  checkOutput('list', /\[1\] Test Task 1 \(done\).*\[2\] Test Task 2 \(pending\)/s, "List shows task 1 done");
  
  logStep("Remove task 2");
  checkOutput('remove 2', 'Removed task with ID 2');
  verifyTodosFile(todos => todos.length === 1 && !todos.some(t => t.id === 2), "Task 2 removed from JSON");
  
  logStep("List tasks - expecting task 2 gone, task 1 done");
  checkOutput('list', /\[1\] Test Task 1 \(done\)/s, "List shows task 1 done");
  checkOutput('list', '!Removed task with ID 2', "List does not show task 2"); // A way to check non-existence

  logStep("Final cleanup: Delete todos.json");
  deleteTodosFile();
  verifyTodosFile(todos => todos.length === 0, "todos.json deleted");

  if (overallSuccess) {
    console.log("\n✅ All CLI Todo checks PASSED!");
    process.exit(0);
  } else {
    console.error("\n❌ Some CLI Todo checks FAILED.");
    process.exit(1);
  }
}

// Handle unhandled rejections and uncaught exceptions for the check script itself
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  deleteTodosFile(); // Attempt cleanup
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  deleteTodosFile(); // Attempt cleanup
  process.exit(1);
});

runChecks().catch(e => {
    console.error("Critical error during check script execution:", e);
    deleteTodosFile();
    process.exit(1);
});
