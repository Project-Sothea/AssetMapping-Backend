import { Router, Request, Response, NextFunction } from 'express';
import { imageService } from '../services/image.service';
import { validateRequest } from '../middleware/validation';
import { ImageUploadRequestSchema, ImageUploadRequest } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/images/signed-url
 * Get a signed URL for uploading an image to Supabase storage
 */
router.post(
  '/signed-url',
  validateRequest(ImageUploadRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request: ImageUploadRequest = req.body;

      logger.info('Signed URL request', {
        entityType: request.entityType,
        entityId: request.entityId,
        filename: request.filename,
      });

      const signedUrl = await imageService.getSignedUploadUrl(request);

      logger.info('Signed upload URL generated', {
        path: `${request.entityType}/${request.entityId}`,
      });

      res.json({
        success: true,
        data: signedUrl,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
