import { Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync/sync.service';
import { SyncItemRequestSchema, SyncItemRequest } from '../types';

export class SyncController {
  static async sync(req: Request, res: Response, next: NextFunction) {
    try {
      const request: SyncItemRequest = req.body as SyncItemRequest;
      const validatedRequest = SyncItemRequestSchema.parse(request);
      const result = await syncService.sync(validatedRequest);
      res.json({ success: true, data: result, idempotencyKey: validatedRequest.idempotencyKey, timestamp: new Date().toISOString() });
    } catch (error) {
      return next(error);
    }
  }
}
