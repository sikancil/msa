import { execSync } from 'child_process';
import path from 'path';

// Determine the path to the compiled index.js
// Assumes check.ts is in src/ and index.js is in dist/ relative to project root
const projectRoot = path.join(__dirname, '..'); // Moves from src to project root
const cliScriptPath = path.join(projectRoot, 'dist', 'index.js');

const testMessage = "Hello Checker!";
// Ensure the command correctly quotes the message if it can contain spaces.
// node dist/index.js echo "Hello Checker!"
const command = `node "${cliScriptPath}" echo "${testMessage}"`;

let success = false;

try {
  console.log(`Executing check command: ${command}`);
  // Execute the command and capture stdout
  const output = execSync(command, { encoding: 'utf8' });
  
  // Trim whitespace (especially trailing newlines)
  const trimmedOutput = output.trim();

  console.log(`Expected output: "${testMessage}"`);
  console.log(`Actual output:   "${trimmedOutput}"`);

  if (trimmedOutput === testMessage) {
    console.log("\n✅ CLI Echo Check Passed!");
    success = true;
  } else {
    console.error(`\n❌ CLI Echo Check Failed!`);
    console.error(`  Expected: "${testMessage}"`);
    console.error(`  Actual:   "${trimmedOutput}"`);
  }
} catch (error) {
  console.error("\n❌ CLI Echo Check Failed with an error during execution!");
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    if ((error as any).stdout) {
      console.error('Stdout:', (error as any).stdout.toString());
    }
    if ((error as any).stderr) {
      console.error('Stderr:', (error as any).stderr.toString());
    }
  } else {
    console.error('An unknown error occurred:', error);
  }
}

if (!success) {
  process.exit(1);
}
process.exit(0);
