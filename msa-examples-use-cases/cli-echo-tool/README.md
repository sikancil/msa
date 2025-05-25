# MSA CLI Echo Tool Example

This example demonstrates a simple Command Line Interface (CLI) tool built using the `@arifwidianto/msa-core` and `@arifwidianto/msa-plugin-stdio`.

The tool provides a single command, `echo`, which takes a text string as an argument and prints it back to the console.

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
cd msa-examples-use-cases/cli-echo-tool
```

### Using ts-node (for development)

You can run the tool directly using `ts-node`:

```bash
npx ts-node src/index.ts echo "Hello World from MSA!"
```
Or, if you have `ts-node` installed globally or as a project dev dependency and added a script to `package.json`:
```bash
npm run dev -- echo "Hello World from MSA!" 
```
(This assumes the `dev` script in `package.json` is `ts-node src/index.ts`)


### Building and Running the JavaScript version

1.  **Build the example:**
    ```bash
    npm run build
    ```
    This will compile the TypeScript source in `src/` to JavaScript in `dist/`.

2.  **Run the compiled code:**
    ```bash
    npm start -- echo "Hello World from MSA!"
    ```
    (This uses the `start` script: `node dist/index.js`)

    Alternatively, you can run directly with node:
    ```bash
    node dist/index.js echo "Hello World from MSA!"
    ```

## Expected Output

For any of the run commands above, the expected output on your console will be:

```
Hello World from MSA!
```
(Or whatever text you provided after the `echo` command).
The tool will also log some informational messages from the MSA core logger about service and plugin initialization.
