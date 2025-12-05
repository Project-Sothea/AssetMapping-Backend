import { Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync/sync.service';
import { SyncItemRequestSchema, SyncItemRequest, ApiResponse } from '../types';
import type { Pin, Form } from '../db/schema';

type SyncResult = Pin | Form | { id: string; deleted: boolean };

export class SyncController {
  static async sync(
    req: Request,
    res: Response<ApiResponse<SyncResult>>,
    next: NextFunction
  ) {
    try {
      const request: SyncItemRequest = req.body as SyncItemRequest;
      const validatedRequest = SyncItemRequestSchema.parse(request);
      const result = await syncService.sync(validatedRequest);
      res.json({
        success: true,
        data: result,
        message: 'Sync item processed',
      });
    } catch (error) {
      return next(error);
    }
  }
}
