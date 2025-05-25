# Post Service (Inter-Service Communication Example)

This service is part of the inter-service communication example. It manages post data and interacts with the `user-service` to enrich post information with author details.

## Purpose

-   Demonstrates a simple microservice built with `@arifwidianto/msa-core` and `@arifwidianto/msa-plugin-http`.
-   Shows how one service can call another service over HTTP (using `axios`) to fetch related data.

## Setup

1.  Ensure monorepo dependencies are installed (`npm install` or `pnpm install` from root).
2.  Build core packages:
    ```bash
    # From monorepo root
    npm run build --workspace=@arifwidianto/msa-core
    npm run build --workspace=@arifwidianto/msa-plugin-http
    # or using pnpm
    # pnpm build --filter @arifwidianto/msa-core --filter @arifwidianto/msa-plugin-http
    ```
3.  **Crucially, the `user-service` must be running for the `/posts/:id` endpoint to fully function.** See the `user-service` README for instructions on running it (typically on `http://localhost:3002`).

## Running the Service

Navigate to this service's directory:
```bash
cd msa-examples-use-cases/inter-service-comm/post-service
```

### Using ts-node (for development)
```bash
npm run dev
# or npx ts-node src/index.ts
```

### Building and Running JavaScript
1.  Build: `npm run build`
2.  Run: `npm start`

The service will listen on port 3003 by default (or as configured in `src/index.ts`).

## API Endpoints

-   **`GET /posts/user/:userId`**
    -   Retrieves all posts for a given user ID.
    -   Example: `curl http://localhost:3003/posts/user/1`
    -   Success Response (200 OK): `[{"id":101,"userId":1,"title":"Alice's First Post","content":"Hello from Alice!"},{"id":103,"userId":1,"title":"Alice's Second Post","content":"Working with microservices."}]`

-   **`GET /posts/:id`**
    -   Retrieves details for a specific post, enriched with author information from `user-service`.
    -   Example: `curl http://localhost:3003/posts/101` (Ensure `user-service` is running and user ID 1 exists)
    -   Success Response (200 OK, with user data): `{"id":101,"title":"Alice's First Post","content":"Hello from Alice!","user":{"id":1,"name":"Alice"}}`
    -   Success Response (200 OK, if user not found or user service error): `{"id":101,"title":"Alice's First Post","content":"Hello from Alice!","user":{"id":1,"name":"Unknown User (Not Found)"}}` or `{"id":101,"title":"Alice's First Post","content":"Hello from Alice!","user":{"id":1,"name":"Unknown User (Error Fetching)"}}`
    -   Not Found Response (404 Not Found, if post itself doesn't exist): `{"error":"Post with ID <id> not found."}`

-   **`GET /`**
    -   Returns a welcome message.
    -   Example: `curl http://localhost:3003/`
    -   Success Response (200 OK): `{"message":"Post Service is active. Use /posts/user/:userId or /posts/:id."}`
