import { Router } from 'express';
import { SyncController } from '../controllers/sync.controller';

const router = Router();

/**
 * POST /api/sync
 * Sync a single item (pin or form) with idempotency support
 * Handles create, update, and delete operations
 */
router.post('/', SyncController.sync);

export default router;
