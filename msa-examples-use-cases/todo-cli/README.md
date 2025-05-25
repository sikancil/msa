# MSA Todo CLI Tool Example

This example demonstrates a simple Command Line Interface (CLI) tool for managing a todo list, built using `@arifwidianto/msa-core` and `@arifwidianto/msa-plugin-stdio`.

The tool allows users to add, list, mark as done, and remove tasks from a todo list stored in a `todos.json` file in the project's root directory.

## Prerequisites

- Node.js and npm installed.
- The monorepo dependencies should be installed (run `npm install` or `pnpm install` from the root of the monorepo).

## Setup

This example tool relies on local packages from this monorepo (`@arifwidianto/msa-core` and `@arifwidianto/msa-plugin-stdio`). Ensure these packages have been built at least once. From the monorepo root:

```bash
# If using npm
npm run build --workspace=@arifwidianto/msa-core
npm run build --workspace=@arifwidianto/msa-plugin-stdio

# Or if using pnpm (recommended for monorepos)
pnpm build --filter @arifwidianto/msa-core
pnpm build --filter @arifwidianto/msa-plugin-stdio
```

## Running the Example

Navigate to this example's directory:
```bash
cd msa-examples-use-cases/todo-cli
```

### Using ts-node (for development)

You can run the tool directly using `ts-node` via the `dev` script in `package.json`:

**Commands:**

-   **Add a task:**
    ```bash
    npm run dev -- add Buy groceries for the week
    # Expected output: Added: [1] Buy groceries for the week (pending)
    npm run dev -- add Prepare presentation slides
    # Expected output: Added: [2] Prepare presentation slides (pending)
    ```

-   **List tasks:**
    ```bash
    npm run dev -- list
    # Expected output (example):
    # [1] Buy groceries for the week (pending)
    # [2] Prepare presentation slides (pending)
    ```

-   **Mark a task as done:**
    ```bash
    npm run dev -- done 1
    # Expected output: Marked done: [1] Buy groceries for the week
    ```

-   **Remove a task:**
    ```bash
    npm run dev -- remove 2
    # Expected output: Removed task with ID 2.
    ```

### Building and Running the JavaScript version

1.  **Build the example:**
    ```bash
    npm run build
    ```
    This will compile the TypeScript source in `src/` to JavaScript in `dist/`.

2.  **Run the compiled code (using the `start` script):**
    ```bash
    npm start -- add "My new task from compiled code"
    npm start -- list
    npm start -- done <id_from_list>
    npm start -- remove <id_from_list>
    ```
    Alternatively, you can run directly with node:
    ```bash
    node dist/index.js list
    ```

## Expected Output

The tool will provide feedback for each command, such as confirmation messages or the list of tasks. The todo items are stored in a `todos.json` file in the `msa-examples-use-cases/todo-cli/` directory.

## Checking the Tool (Automated Test)

This example includes a basic end-to-end check script. To run it:

```bash
npm run check
```
This script will perform a sequence of add, list, done, and remove operations and verify the output. It will clean up the `todos.json` file before and after the checks. Look for "✅ All checks PASSED!" or "❌ Some checks FAILED." in the output.
