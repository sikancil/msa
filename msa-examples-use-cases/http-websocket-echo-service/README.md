# MSA HTTP & WebSocket Echo Service Example

This example demonstrates a service that provides both HTTP and WebSocket echo functionalities using the `@arifwidianto/msa-core` and the `@arifwidianto/msa-plugin-http` and `@arifwidianto/msa-plugin-websocket` transport plugins.

## Features

-   **HTTP Echo:** Responds on `/echo/:message` by returning a JSON object `{ "echo": "yourmessage" }`.
-   **HTTP Root:** Responds on `/` with a welcome message.
-   **WebSocket Echo:** Echoes back any message received from a WebSocket client to that same client. Supports both text and binary messages.

## Prerequisites

-   Node.js and npm installed.
-   The monorepo dependencies should be installed (run `npm install` or `pnpm install` from the root of the monorepo).

## Setup

This example tool relies on local packages from this monorepo. Ensure these packages have been built at least once. From the monorepo root:

```bash
# If using npm
npm run build --workspace=@arifwidianto/msa-core
npm run build --workspace=@arifwidianto/msa-plugin-http
npm run build --workspace=@arifwidianto/msa-plugin-websocket

# Or if using pnpm (recommended for monorepos)
pnpm build --filter @arifwidianto/msa-core
pnpm build --filter @arifwidianto/msa-plugin-http
pnpm build --filter @arifwidianto/msa-plugin-websocket
```

## Running the Example

Navigate to this example's directory:
```bash
cd msa-examples-use-cases/http-websocket-echo-service
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
(This assumes the `dev` script in `package.json` is `ts-node src/index.ts`)

The service will start, and you should see log messages indicating that the HTTP service is listening on port 3000 and the WebSocket service is listening on port 3001.

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

### HTTP Endpoints

-   **Root:** Open your browser or use `curl` to access `http://localhost:3000/`.
    You should receive: `{"message":"Welcome to the MSA Echo Service. Use /echo/:message for HTTP echo, or connect via WebSocket."}`
-   **Echo:** Open your browser or use `curl` to access `http://localhost:3000/echo/HelloMSA`.
    You should receive: `{"echo":"HelloMSA"}`

    Example with `curl`:
    ```bash
    curl http://localhost:3000/echo/HelloWorld
    # Output: {"echo":"HelloWorld"}
    ```

### WebSocket Endpoint

Use a WebSocket client (e.g., a browser-based WebSocket tester, `wscat`, or a simple Node.js script) to connect to `ws://localhost:3001`.

-   Any text message you send to the server will be echoed back to you.
-   Any binary message you send will also be echoed back.

**Example using `wscat` (if installed: `npm install -g wscat`):**
```bash
wscat -c ws://localhost:3001
```
Then type your message and press Enter. The server will echo it back.

## Stopping the Service
Press `Ctrl+C` in the terminal where the service is running. The service implements graceful shutdown to stop plugins and exit.
