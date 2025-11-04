# Sync Service

A modular sync service for handling pin and form synchronization operations with event sourcing support.

## Structure

```
sync/
├── index.ts                      # Main export
├── sync.service.ts              # Orchestrator service (main entry point)
├── operations/                   # Entity-specific CRUD operations
│   ├── pin.operations.ts        # Pin sync operations
│   └── form.operations.ts       # Form sync operations
└── events/                       # Event handling
    ├── event-publisher.ts       # Publishes events to Kafka, Outbox, and Audit log
    └── event-factory.ts         # Creates domain events for event sourcing
```

## Responsibilities

### `sync.service.ts` (Orchestrator)

- Main entry point for sync operations
- Handles idempotency wrapping
- Delegates to appropriate operations
- Coordinates event publishing
- **Public API**: `syncItem()`

### `operations/pin.operations.ts`

- Pin CRUD operations (create, update, delete)
- Version tracking for pins
- Data preparation and validation
- Direct database operations for pins

### `operations/form.operations.ts`

- Form CRUD operations (create, update, delete)
- Version tracking for forms
- Data preparation and validation
- Direct database operations for forms

### `events/event-publisher.ts`

- Publishes sync events to Kafka
- Publishes domain events to Outbox (for WebSocket notifications)
- Publishes audit logs
- Determines event types based on operations

### `events/event-factory.ts`

- Creates domain events for event sourcing
- Constructs Pin/Form Created/Updated/Deleted events
- Manages event versioning
- Pure functions for event creation

## Usage

```typescript
import { syncService } from './services/sync';

// Sync a pin or form
const result = await syncService.syncItem({
  idempotencyKey: 'unique-key',
  entityType: 'pin',
  operation: 'create',
  payload: {
    /* pin data */
  },
  deviceId: 'device-123',
  timestamp: new Date().toISOString(),
});
```

## Benefits

✅ **Separation of Concerns**: Each module has a single, well-defined responsibility
✅ **Testability**: Smaller modules are easier to unit test
✅ **Maintainability**: Changes are localized to specific modules
✅ **Readability**: Clear folder structure shows the architecture
✅ **Reusability**: Operations and event handlers can be used independently
✅ **Scalability**: Easy to add new entity types or event handlers

## Design Principles

- **Single Responsibility**: Each file handles one aspect
- **Dependency Injection**: Services are injected, not directly instantiated
- **Immutability**: Data transformations return new objects
- **Error Handling**: Errors are logged and propagated appropriately
- **Type Safety**: Full TypeScript support with proper typing
