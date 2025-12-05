import { Request, Response, NextFunction } from 'express';
import { StorageService } from '../services/storage.service';

export class StorageController {
  static async getUploadUrl(req: Request, res: Response, next: NextFunction) {
      try {
          const key = String(req.query.key || '');
          const mimeType = String(req.query.mimeType || '');
          if (!key || !mimeType) {
              return res.status(400).json({ success: false, error: 'Missing required fields: key, mimeType' });
          }
          const url = await StorageService.getUploadUrl(key, mimeType);
          return res.json({ success: true, data: url });
      } catch (error) {
          return next(error);
      }
  }

  static async getDownloadUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const key = String(req.query.key || '');
      if (!key) {
        return res.status(400).json({ success: false, error: 'Missing key' });
      }
      const url = await StorageService.getDownloadUrl(key);
      return res.json({ success: true, data: url });
    } catch (error) {
      return next(error);
    }
  }

  static async deleteObjects(req: Request, res: Response, next: NextFunction) {
    try {
      const keys = (req.body?.keys as string[]) || [];
      if (!Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ success: false, error: 'Provide non-empty array: keys[]' });
      }
      const { deleted, errors } = await StorageService.deleteByKeys(keys);
      return res.json({ success: true, data: { deleted, errors } });
    } catch (error) {
      return next(error);
    }
  }

}
