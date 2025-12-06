import { Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync/sync.service';
import { SyncItemRequestSchema } from '../types';
import type { SyncItemRequest, ApiResponse, SyncResult } from '@assetmapping/shared-types';

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
