import { Router } from 'express';

import { SyncController } from '../controllers/sync.controller';
import { syncService } from '../services/sync.service';

const router = Router();

/**
 * POST /api/sync
 * Sync a single item (pin or form) with idempotency support
 * Handles create, update, and delete operations
 */
router.post('/', SyncController.sync);

router.get('/snapshot', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await syncService.snapshot() });
  } catch (error) {
    next(error);
  }
});

export default router;
