# Inter-Service Communication Example: User & Posts

This example demonstrates basic inter-service communication between two microservices: a `user-service` and a `post-service`. The `post-service` fetches user information from the `user-service` to enrich its post data.

## Services

1.  **`user-service`**:
    *   Manages user data (in-memory).
    *   Exposes an HTTP API to get user details.
    *   Typically runs on `http://localhost:3002`.
    *   See `user-service/README.md` for more details.

2.  **`post-service`**:
    *   Manages post data (in-memory).
    *   Exposes HTTP API endpoints for posts.
    *   One of its endpoints (`/posts/:id`) calls the `user-service` to fetch author details for a post.
    *   Typically runs on `http://localhost:3003`.
    *   See `post-service/README.md` for more details.

## Prerequisites

-   Node.js and npm installed.
-   The monorepo dependencies should be installed (run `npm install` or `pnpm install` from the root of the monorepo).
-   The core MSA packages and plugins used by these services must be built:
    ```bash
    # From monorepo root
    npm run build --workspace=@arifwidianto/msa-core
    npm run build --workspace=@arifwidianto/msa-plugin-http
    # or using pnpm
    # pnpm build --filter @arifwidianto/msa-core --filter @arifwidianto/msa-plugin-http
    ```

## Running the Services

You need to run both services concurrently, typically in separate terminal windows.

**Terminal 1: Start `user-service`**
```bash
cd msa-examples-use-cases/inter-service-comm/user-service
npm run dev 
# Or: npx ts-node src/index.ts
# Or build and start: npm run build && npm start
```
The User Service should start and listen on port 3002.

**Terminal 2: Start `post-service`**
```bash
cd msa-examples-use-cases/inter-service-comm/post-service
npm run dev
# Or: npx ts-node src/index.ts
# Or build and start: npm run build && npm start
```
The Post Service should start and listen on port 3003.

## Testing Interaction

Once both services are running:

1.  **Get a post with enriched user data:**
    Open your browser or use `curl`:
    ```bash
    curl http://localhost:3003/posts/101
    ```
    Expected output (assuming user ID 1 is Alice in `user-service`):
    ```json
    {
      "id": 101,
      "title": "Alice's First Post",
      "content": "Hello from Alice!",
      "user": {
        "id": 1,
        "name": "Alice"
      }
    }
    ```

2.  **Get posts for a specific user:**
    ```bash
    curl http://localhost:3003/posts/user/1
    ```
    Expected output:
    ```json
    [
      {
        "id": 101,
        "userId": 1,
        "title": "Alice's First Post",
        "content": "Hello from Alice!"
      },
      {
        "id": 103,
        "userId": 1,
        "title": "Alice's Second Post",
        "content": "Working with microservices."
      }
    ]
    ```

## Automated Check

An automated check script is provided at the root of this `inter-service-comm` example directory. To run it:

1.  Ensure you are in the `msa-examples-use-cases/inter-service-comm` directory.
2.  Make sure `user-service` and `post-service` are **not** currently running (the check script will start them).
3.  Build both services:
    ```bash
    (cd user-service && npm run build) && (cd post-service && npm run build)
    ```
4.  Run the check:
    ```bash
    npm run check 
    # (This assumes a root package.json with a "check" script is set up, see step C.3)
    # Or directly if ts-node is available:
    # npx ts-node check.ts
    ```
The script will start both services, make a request to the `post-service` that triggers inter-service communication, verify the response, and then shut down the services. Look for "✅ All checks PASSED!" or "❌ Some checks FAILED." in the output.
