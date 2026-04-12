# Asset Mapping Backend
### Last Updated: 12 Apr, 2026

## Overview

This is the backend for the asset mapping system, built as a Node.js REST API with real-time WebSocket support. It is designed to be used in conjunction with the mobile frontend.  
The server is written in TypeScript using Express.js. It uses PostgreSQL for persistent storage via Drizzle ORM, Redis for idempotency caching and distributed locking, and AWS S3 for image storage.

---

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js 18+](https://nodejs.org/) - JavaScript runtime.
- [Docker](https://www.docker.com/) - For running PostgreSQL and Redis locally.
- AWS S3 bucket (or compatible storage) — for image uploads.

## Installation and Setup

1. Clone the repository to your local machine: `git clone <repository-url>`

2. Install dependencies: `npm install`

3. Copy `.env.example` to `.env` and fill in the required values (see below).

4. Start the local PostgreSQL and Redis instances: `docker-compose up -d`

5. Run database migrations: `npm run migrate`

6. Start the development server: `npm run dev`

7. To build and run in production:
   ```bash
   npm run build
   npm run start
   ```

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Express server port |
| `NODE_ENV` | `development` | Environment (`development` / `production`) |
| `DATABASE_URL` | `postgres://postgres:postgres123@localhost:55432/assetmapping` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `MAX_IMAGE_SIZE_MB` | `10` | Maximum image upload size in MB |
| `AWS_ENDPOINT_URL` | — | S3 endpoint or CDN base URL |
| `AWS_S3_BUCKET_NAME` | `asset-mapping` | S3 bucket name |
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret key |

---

## Developer Documentation

## Entity Design

The two core data entities are **Pins** and **Forms**.

- **Pin** — a location marker on the map. Represents a health facility or community site. Has a name, coordinates, address, type, and a list of attached images.
- **Form** — a health assessment form linked to a pin. Contains sections for general demographics, health, education, and water/sanitation.

Each entity has the following metadata fields:

```
+----+------------+------------+---------+--------+
| id | created_at | updated_at | version | status |
+----+------------+------------+---------+--------+
```

The `version` field is used for optimistic concurrency control during sync. The `status` field tracks the sync state of a record.

Forms belong to pins via a foreign key (`pinId`), with cascade delete.

Full schema: `packages/shared-types/src/schema.ts`

## Database and Database Schema

The database is PostgreSQL, accessed via [Drizzle ORM](https://orm.drizzle.team/). The schema is defined in `packages/shared-types/src/schema.ts` and migrations are generated into the `drizzle/` folder — these should not be edited by hand.

### Drizzle Configuration (`drizzle.config.ts`)

Key settings:

- **`schema: './packages/shared-types/src/schema.ts'`** — single source of truth for the schema.
- **`out: './drizzle'`** — generated migration files are written here.
- **`dialect: 'postgresql'`** — targets PostgreSQL.

### Workflow

When you change `packages/shared-types/src/schema.ts`, regenerate and apply migrations:

```bash
npm run migrate        # Apply pending migrations to the database
```

The generated files in `drizzle/` are committed to source control.

### DB Utilities (`src/db/utils.ts`)

Because PostgreSQL stores array fields as JSON strings in this schema, `src/db/utils.ts` provides `sanitizePinForDb` / `sanitizeFormForDb` (serialise arrays before write) and `mapPinDbToPin` / `mapFormDbToForm` (deserialise arrays after read). Callers work with plain `string[]` and never handle JSON encoding directly.

## Sync Architecture

The backend receives sync operations from mobile clients via a single `POST /api/sync` endpoint. Each operation targets one entity (pin or form) and specifies a create, update, or delete action.

**Idempotency:** Every sync request includes an `idempotencyKey` UUID. The result is cached in Redis for 24 hours, so retried requests (e.g. after a network failure) are safe to resubmit without creating duplicates.

**Distributed Locking:** A per-key Redis lock prevents concurrent processing of the same idempotency key.

**Circuit Breaker:** If Redis is unavailable, the idempotency layer degrades gracefully and the operation proceeds — database constraints ensure correctness.

**Version Conflict Resolution:** Each entity has an integer `version` field. When the client submits an operation:
- If the client version matches the server version, the operation is applied and the version is incremented.
- If the client version is behind the server version, `updatedAt` timestamps are compared and the latest write wins.

**WebSocket Notifications:** After a successful sync operation, the result is broadcast to all connected clients over WebSocket (`/ws/notifications`), so other devices see changes in real time.

The sync request shape:

```
+------------------+-------------+-----------+----------+---------+
| idempotencyKey   | operation   | entityType| entityId | payload |
+------------------+-------------+-----------+----------+---------+
```

Key sync files:
- `src/services/sync.service.ts` — orchestrates the full sync lifecycle
- `src/services/infrastructure/idempotency.service.ts` — Redis-backed idempotency with circuit breaker
- `src/services/infrastructure/distributed-lock.service.ts` — Redis locks
- `src/services/sync/operations/base.operations.ts` — version conflict resolution and upsert/delete logic
- `src/services/sync/publishers/sync-event.publisher.ts` — WebSocket broadcast after sync

## Image Storage

Images are stored in AWS S3. The client never receives raw AWS credentials — the backend generates short-lived presigned URLs:

- **Upload:** `GET /api/storage/upload-url?key=<uuid>&mimeType=<type>` returns a presigned S3 PUT URL. The client uploads directly to S3.
- **Download:** `GET /api/storage/download-url?key=<path>` returns a presigned S3 GET URL.
- **Delete:** `DELETE /api/storage/objects` with a list of keys removes objects from S3.

Image keys follow the pattern `pins/{pinId}/{imageUuid}`. Multiple images per pin are stored as a JSON-stringified array in the `images` column.

When a pin is deleted, its associated S3 images are also deleted. If the S3 deletion fails, the database deletion proceeds and the images are left as orphans in the bucket.

## Directory Structure

```
.
├── README.md
├── package.json
├── tsconfig.json
├── drizzle.config.ts               - Drizzle ORM configuration for PostgreSQL migrations.
├── docker-compose.yml              - Local PostgreSQL (port 55432) and Redis (port 6379) services.
├── .env.example                    - Environment variable template.
├── drizzle/                        - Auto-generated Drizzle migration files. Do NOT edit manually.
├── packages/
│   └── shared-types/               - Monorepo package shared between backend and frontend.
│       └── src/
│           ├── schema.ts           - Drizzle table definitions (pins, forms).
│           └── index.ts            - Exported TypeScript types and constants.
└── src/
    ├── server.ts                   - Express app entry point; initialises middleware, routes, and WebSocket.
    ├── config/
    │   ├── index.ts                - Loads and validates environment variables at startup.
    │   └── redis.ts                - Redis client initialisation.
    ├── controllers/                - HTTP request handlers (thin layer between routes and services).
    │   ├── sync.controller.ts      - Handles POST /api/sync.
    │   ├── pin.controller.ts       - Handles read operations for pins.
    │   ├── form.controller.ts      - Handles read operations for forms.
    │   └── storage.controller.ts   - Handles presigned URL generation and object deletion.
    ├── routes/                     - Express route definitions.
    │   ├── sync.routes.ts          - POST /api/sync
    │   ├── pin.routes.ts           - GET /api/pins, /api/pins/since, /api/pins/:id
    │   ├── form.routes.ts          - GET /api/forms, /api/forms/since, /api/forms/:id
    │   └── storage.routes.ts       - GET /api/storage/upload-url, /download-url; DELETE /objects
    ├── services/                   - Business logic.
    │   ├── sync.service.ts         - Orchestrates sync with idempotency, locking, and timeouts.
    │   ├── pin.service.ts          - Pin CRUD operations via Drizzle.
    │   ├── form.service.ts         - Form CRUD operations via Drizzle.
    │   ├── storage.service.ts      - S3 presigned URL generation and object deletion.
    │   ├── infrastructure/
    │   │   ├── idempotency.service.ts      - Redis-backed idempotency with circuit breaker.
    │   │   └── distributed-lock.service.ts - Redis distributed locks.
    │   └── sync/
    │       ├── operations/
    │       │   ├── base.operations.ts      - Version conflict resolution and upsert/delete flow.
    │       │   ├── pin.operations.ts       - Pin-specific sync operations.
    │       │   ├── form.operations.ts      - Form-specific sync operations.
    │       │   └── operations.interface.ts - IOperations contract.
    │       └── publishers/
    │           └── sync-event.publisher.ts - WebSocket broadcast after a successful sync.
    ├── db/
    │   ├── index.ts                - Drizzle client initialisation (exports the db instance).
    │   └── utils.ts                - Type conversion between DB rows and API types (JSON array handling).
    ├── middleware/
    │   ├── errorHandler.ts         - Global error handler and 404 handler.
    │   └── requestLogger.ts        - HTTP request logging with timing.
    ├── websocket/
    │   ├── initializer.ts          - WebSocket server setup on /ws/notifications.
    │   └── manager.ts              - Connection tracking and broadcast to all connected clients.
    ├── utils/
    │   ├── logger.ts               - Winston structured logger (console + file output).
    │   └── parsing.ts              - Safe JSON parsing and timestamp utilities.
    ├── types/
    │   └── index.ts                - AppError and ConflictError classes.
    └── health/                     - GET /health endpoint (uptime and environment info).
```

## Naming and Code Conventions

Database Fields: camelCase (Drizzle ORM convention)  
e.g. `pinId`, `createdAt`, `villageId`

TypeScript Types: PascalCase  
e.g. `Pin`, `Form`, `SyncItemRequest`

API JSON Fields: camelCase  
e.g. `pinId`, `createdAt`

Service Classes: `{Entity}Service` — exported as a singleton instance  
e.g. `export const pinService = new PinService()`

DB Utilities: `sanitize{Entity}ForDb()` for writes, `map{Entity}DbTo{Entity}()` for reads

## Miscellaneous Design Choices

### Single Sync Endpoint

All create, update, and delete operations for both pins and forms go through a single `POST /api/sync` endpoint. This simplifies the client: one idempotency key, one endpoint, one retry pattern. Read operations are on separate entity routes (`/api/pins`, `/api/forms`) for query flexibility.

### Version-Based Conflict Resolution

Every entity has an integer `version` field that is incremented on each write. When the server receives a sync operation, it compares the client version against the current server version. On conflict, it falls back to `updatedAt` timestamp comparison (last-write-wins). This ensures stale updates from offline clients do not silently overwrite newer server state.

### Array Fields as JSON Strings

PostgreSQL stores multi-value fields (e.g. `images`, `longTermConditions`, `waterSources`) as JSON-serialised strings. Deserialisation on read and serialisation on write is handled transparently in the service layer. Callers always work with `string[]`.

### Presigned URLs for Image Uploads

Clients upload images directly to S3 using short-lived presigned PUT URLs. The backend never proxies the image data, which reduces bandwidth and keeps the request path fast for field workers on slow connections.

### Shared Types Package

The `packages/shared-types` workspace contains the Drizzle schema and TypeScript type definitions. Both the backend and the frontend import from this package, keeping entity shapes in sync across the stack.

### Structured Logging

Winston logs to both console and files (`error.log`, `combined.log`) using a structured JSON format. Log level is `DEBUG` in development and `INFO` in production.
