# MSA Task Manager SQLite Service Example

This example demonstrates a simple Task Manager service built using `@arifwidianto/msa-core`, `@arifwidianto/msa-plugin-http`, and `sqlite3` for data persistence.

The service provides a RESTful API for managing tasks (Create, Read, Update, Delete).

## Features

-   **Create Task:** `POST /tasks` with JSON body `{ "description": "Your task description" }`
-   **Get All Tasks:** `GET /tasks`
-   **Get Task by ID:** `GET /tasks/:id`
-   **Update Task:** `PUT /tasks/:id` with JSON body `{ "description": "New description", "status": "done" }` (both fields optional)
-   **Delete Task:** `DELETE /tasks/:id`

Task statuses can be 'pending' or 'done'.

## Prerequisites

-   Node.js and npm installed.
-   The monorepo dependencies should be installed (run `npm install` or `pnpm install` from the root of the monorepo).

## Setup

This example relies on local packages from this monorepo. Ensure these packages have been built at least once. From the monorepo root:

```bash
# If using npm
npm run build --workspace=@arifwidianto/msa-core
npm run build --workspace=@arifwidianto/msa-plugin-http

# Or if using pnpm (recommended for monorepos)
pnpm build --filter @arifwidianto/msa-core
pnpm build --filter @arifwidianto/msa-plugin-http
```

### Database Initialization

Before running the service for the first time, or if you want to reset the database, you need to initialize the SQLite database and create the necessary tables.

Navigate to this example's directory:
```bash
cd msa-examples-use-cases/task-manager-sqlite-service
```
Then run the database initialization script:
```bash
npm run db:init
```
This will create a `tasks.db` file in the `msa-examples-use-cases/task-manager-sqlite-service/` directory with the required `tasks` table.

## Running the Example

Navigate to this example's directory:
```bash
cd msa-examples-use-cases/task-manager-sqlite-service
```

### Using ts-node (for development)

You can run the service directly using `ts-node`:

```bash
npx ts-node src/index.ts
```
Or, if you have `ts-node` installed globally or as a project dev dependency and use the script from `package.json`:
```bash
npm run dev
```
The service will start, and you should see log messages indicating that the HTTP service is listening on port 3002 (or as configured).

### Building and Running the JavaScript version

1.  **Build the example:**
    ```bash
    npm run build
    ```
    This will compile the TypeScript source in `src/` to JavaScript in `dist/`.

2.  **Run the compiled code:**
    ```bash
    npm start
    ```
    (This uses the `start` script: `node dist/index.js`)

## Interacting with the Service

You can use tools like `curl` or Postman to interact with the API endpoints. The service runs on `http://localhost:3002` by default.

-   **Create a new task:**
    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"description":"Buy milk"}' http://localhost:3002/tasks
    ```
-   **Get all tasks:**
    ```bash
    curl http://localhost:3002/tasks
    ```
-   **Get a specific task (e.g., ID 1):**
    ```bash
    curl http://localhost:3002/tasks/1
    ```
-   **Update a task (e.g., ID 1):**
    ```bash
    curl -X PUT -H "Content-Type: application/json" -d '{"description":"Buy almond milk", "status":"done"}' http://localhost:3002/tasks/1
    ```
-   **Delete a task (e.g., ID 1):**
    ```bash
    curl -X DELETE http://localhost:3002/tasks/1
    ```

## Checking the Tool (Automated Test)

This example includes an end-to-end check script. To run it:

1.  Ensure the database is initialized: `npm run db:init` (the check script will also try to do this).
2.  Run the check:
    ```bash
    npm run check
    ```
This script will start the service, perform a sequence of CRUD operations, verify the responses, and then stop the service. It cleans up the `tasks.db` file before starting the checks. Look for "✅ All checks PASSED!" or "❌ Some checks FAILED." in the output.
