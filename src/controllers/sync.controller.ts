import type { SyncItemRequest, ApiResponse, SyncResult } from '@assetmapping/shared-types';
import { Request, Response, NextFunction } from 'express';

import { syncService } from '../services/sync.service';

export class SyncController {
  static async sync(req: Request, res: Response<ApiResponse<SyncResult>>, next: NextFunction) {
    try {
      const request: SyncItemRequest = req.body as SyncItemRequest;
      const result = await syncService.sync(request);
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
