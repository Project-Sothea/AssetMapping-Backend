import { Router, Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync';
import { validateRequest } from '../middleware/validation';
import { SyncItemRequestSchema, SyncItemRequest } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/sync/item
 * Sync a single item (pin or form) with idempotency support
 * Handles create, update, and delete operations
 */
router.post(
  '/item',
  validateRequest(SyncItemRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request: SyncItemRequest = req.body;

      logger.info('Sync item request received', {
        idempotencyKey: request.idempotencyKey,
        entityType: request.entityType,
        operation: request.operation,
      });

      const result = await syncService.syncItem(request);

      res.json({
        success: true,
        data: result,
        idempotencyKey: request.idempotencyKey,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
