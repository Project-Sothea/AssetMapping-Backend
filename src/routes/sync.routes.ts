import { Router, Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync.service';
import { validateRequest } from '../middleware/validation';
import { SyncItemRequestSchema, SyncItemRequest } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/sync/item
 * Sync a single item (pin or form) with idempotency
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

/**
 * POST /api/sync/batch
 * Batch sync with versioning support
 */
router.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchId, deviceId, userId, items } = req.body;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        message: 'batchId is required',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'deviceId is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: 'items must be an array',
      });
    }

    logger.info('Batch sync v2 request received', {
      batchId,
      deviceId,
      userId,
      count: items.length,
    });

    const result = await syncService.processSyncBatchWithVersioning(
      batchId,
      deviceId,
      userId,
      items
    );

    const successCount = result.results.filter((r) => r.success).length;
    const conflictCount = result.results.filter((r) => r.conflict).length;
    const failureCount = result.results.length - successCount - conflictCount;

    res.json({
      success: true,
      results: result.results,
      summary: {
        total: items.length,
        succeeded: successCount,
        conflicts: conflictCount,
        failed: failureCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
  return;
});

export default router;
