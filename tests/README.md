# AssetMapping Backend Tests

This directory contains system tests for the AssetMapping backend's offline-first synchronization features.

## Prerequisites

Before running tests, ensure you have:

1. **Backend running** on `http://localhost:3000`
2. **Redis running** on default port (6379)
3. **Supabase configured** with proper environment variables in `.env`

## Quick Start

```bash
# Run all system tests
npm run test:system

# Or use the test runner script directly
bash scripts/run-tests.sh
```

## Running Specific Tests

```bash
# Pin Operations
npm run test:pins

# Form Operations
npm run test:forms

# Batch Operations
npm run test:batch

# Idempotency Tests
npm run test:idempotency

# Conflict Resolution
npm run test:conflicts

# End-to-End Workflows
npm run test:workflows
```

## Test Modes

```bash
# Watch mode (re-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Run all tests
npm test
```

## Test Suite Overview

### Pins (`tests/system/pins/`)

- **`pins-create.test.ts`**: Pin creation operations
- **`pins-update.test.ts`**: Pin update operations
- **`pins-delete.test.ts`**: Pin deletion operations
- **`pins-pull.test.ts`**: Pin pull sync operations

### Forms (`tests/system/forms/`)

- **`forms-create.test.ts`**: Form creation operations
- **`forms-pull.test.ts`**: Form pull sync operations
- **`forms-relationships.test.ts`**: Pin-form relationships

### Batch (`tests/system/batch/`)

- **`batch-sync.test.ts`**: Batch synchronization
- **`batch-errors.test.ts`**: Batch error handling

### Idempotency (`tests/system/idempotency/`)

- **`idempotency-create.test.ts`**: Create idempotency
- **`idempotency-update.test.ts`**: Update idempotency
- **`idempotency-delete.test.ts`**: Delete idempotency
- **`idempotency-retry.test.ts`**: Retry with same key

### Conflicts (`tests/system/conflicts/`)

- **`conflicts-concurrent.test.ts`**: Concurrent operations
- **`conflicts-resolution.test.ts`**: Conflict resolution
- **`conflicts-versioning.test.ts`**: Version tracking

### Workflows (`tests/system/workflows/`)

- **`workflow-offline-sync.test.ts`**: Offline→online workflows
- **`workflow-multi-device.test.ts`**: Multi-device conflicts
- **`workflow-network-recovery.test.ts`**: Network failure recovery

## Setup Before Testing

1. **Start required services:**

   ```bash
   # Start Redis and Kafka
   docker-compose up -d

   # Start backend
   npm run dev
   ```

2. **Verify services are running:**

   ```bash
   # Check backend
   curl http://localhost:3000/health

   # Check Redis
   redis-cli ping
   ```

3. **Run tests:**
   ```bash
   npm run test:system
   ```

## Test Helper Files

- **`helpers/api-client.ts`**: HTTP client for API calls with retry logic
- **`helpers/test-data.ts`**: Generates test pins and forms
- **`helpers/db-helper.ts`**: Database utilities for verification

## Troubleshooting

### Tests fail with "Backend not running"

```bash
npm run dev
```

### Tests fail with "Redis connection refused"

```bash
docker-compose up -d redis
# or
redis-server
```

### Database errors

Check your `.env` file has valid Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
```

### Clean up test data

```bash
# Tests automatically clean up, but if needed:
npm test tests/setup.ts
```

## CI/CD

Tests are designed to run in CI environments. Ensure all services are available before running tests.

## Writing New Tests

Follow the existing test structure:

1. Use `ApiClient` for API calls
2. Use `TestDataGenerator` for test data
3. Use `DatabaseHelper` for verification
4. Clean up in `afterAll()` hooks
5. Use descriptive test names

### Test Format Guidelines

**File Header:**

```typescript
/**
 * TEST: [Feature Name]
 * [One-line description of what is tested]
 * INPUT: [what goes in] → OUTPUT: [what is expected]
 */
```

**Test Function Comments:**

```typescript
/**
 * [Short description of scenario]
 * INPUT: [input data/actions] → OUTPUT: [expected result]
 */
test('should [action]', async () => {
  // Test implementation
});
```

**Principles:**

- **Concise**: Focus on essential scenarios only
- **Efficient**: Use selective cleanup (track IDs), not global cleanup
- **Clear**: Each test documents input→output in comment
- **Targeted**: Test one thing per test, avoid excessive mocking
- **Realistic**: Simulate real-world usage patterns

Example:

```typescript
/**
 * TEST: Pin Creation
 * Validates creating new pins via sync endpoint.
 * INPUT: pin data → OUTPUT: pin created in database with version=1
 */

describe('Pin Creation', () => {
  let apiClient: ApiClient;
  const createdPinIds: string[] = [];

  beforeAll(async () => {
    apiClient = new ApiClient();
  });

  afterAll(async () => {
    await DatabaseHelper.cleanupSpecific('pin', createdPinIds);
  });

  /**
   * Basic pin creation succeeds.
   * INPUT: valid pin data → OUTPUT: success response, pin in DB
   */
  test('should create a new pin', async () => {
    const pin = TestDataGenerator.generatePin();
    createdPinIds.push(pin.id!);

    const response = await apiClient.syncItem({
      idempotencyKey: apiClient.generateIdempotencyKey(),
      entityType: 'pin',
      operation: 'create',
      payload: pin,
    });

    expect(response.success).toBe(true);
    const dbPin = await DatabaseHelper.getPin(pin.id!);
    expect(dbPin).not.toBeNull();
  });
});
```
