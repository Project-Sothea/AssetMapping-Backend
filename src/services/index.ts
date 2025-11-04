// ==================== Infrastructure Services ====================
// Low-level technical concerns: locks, idempotency, versioning
export * from './infrastructure';

// ==================== Messaging Services ====================
// Event publishing and Kafka operations
export * from './messaging';

// ==================== Notification Services ====================
// Real-time notifications and WebSocket management
export * from './notifications';

// ==================== Consumer Services ====================
// Background workers that consume and process events
export * from './consumers';

// ==================== Sync Services ====================
// Synchronization logic for offline-first support
export { syncService } from './sync/sync.service';
export { pinOperations } from './sync/operations/pin.operations';
export { formOperations } from './sync/operations/form.operations';
export { eventPublisher } from './sync/events/event-publisher';
export { eventBuilder } from './sync/events/event-builder';
export { createDomainEvent } from './sync/events/event-factory';

// Specialized publishers
export { syncEventPublisher } from './sync/publishers/sync-event.publisher';
export { auditLogPublisher } from './sync/publishers/audit-log.publisher';

// ==================== Domain Services ====================
// Business logic services
export { imageService } from './image.service';
