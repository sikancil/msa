# User Service (Inter-Service Communication Example)

This service is part of the inter-service communication example. It manages user data and provides an HTTP endpoint to retrieve user details.

## Purpose

-   Demonstrates a simple microservice built with `@arifwidianto/msa-core` and `@arifwidianto/msa-plugin-http`.
-   Provides user data to other services (e.g., the `post-service`).

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

## Running the Service

Navigate to this service's directory:
```bash
cd msa-examples-use-cases/inter-service-comm/user-service
```

### Using ts-node (for development)
```bash
npm run dev 
# or npx ts-node src/index.ts
```

### Building and Running JavaScript
1.  Build: `npm run build`
2.  Run: `npm start`

The service will listen on port 3002 by default (or as configured in `src/index.ts`).

## API Endpoints

-   **`GET /users/:id`**
    -   Retrieves details for a specific user.
    -   Example: `curl http://localhost:3002/users/1`
    -   Success Response (200 OK): `{"id":1,"name":"Alice","email":"alice@example.com"}`
    -   Not Found Response (404 Not Found): `{"error":"User with ID <id> not found."}`
-   **`GET /`**
    -   Returns a welcome message.
    -   Example: `curl http://localhost:3002/`
    -   Success Response (200 OK): `{"message":"User Service is active. Use /users/:id to get user details."}`
