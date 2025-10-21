import { Router, Request, Response, NextFunction } from 'express';
import { imageService } from '../services/image.service';
import { validateRequest } from '../middleware/validation';
import { ImageUploadRequestSchema, ImageUploadRequest, EntityType } from '../types';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schema for image confirmation
const ImageConfirmationSchema = z.object({
  imageUrl: z.string().url(),
  entityType: z.enum(['pin', 'form']),
  entityId: z.string().min(1),
  sizeBytes: z.number().positive(),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/),
  userId: z.string().min(1),
});

/**
 * POST /api/images/signed-url
 * Get a signed URL for uploading an image
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

/**
 * POST /api/images/confirm
 * Confirm that an image has been successfully uploaded
 * This emits an ImageUploaded event to the event stream
 */
router.post(
  '/confirm',
  validateRequest(ImageConfirmationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageUrl, entityType, entityId, sizeBytes, mimeType, userId } = req.body;

      logger.info('Image upload confirmation', {
        imageUrl,
        entityType,
        entityId,
        userId,
      });

      // Confirm the upload and emit ImageUploaded event
      const result = await imageService.confirmImageUpload({
        imageUrl,
        entityType: entityType as EntityType,
        entityId,
        sizeBytes,
        mimeType,
        userId,
      });

      res.json({
        success: true,
        data: result,
        message: 'Image upload confirmed',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/images/process
 * Process an uploaded image (resize, optimize)
 */
router.post('/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { imageUrl, entityType, entityId } = req.body;

    if (!imageUrl || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message: 'imageUrl, entityType, and entityId are required',
      });
    }

    logger.info('Image processing request', { imageUrl, entityType, entityId });

    const processedUrl = await imageService.processImage(
      imageUrl,
      entityType as EntityType,
      entityId
    );

    res.json({
      success: true,
      data: {
        imageUrl: processedUrl,
      },
    });
  } catch (error) {
    next(error);
  }
  return;
});

/**
 * DELETE /api/images
 * Delete an image
 */
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { imageUrl, entityType, entityId } = req.body;

    if (!imageUrl || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        message: 'imageUrl, entityType, and entityId are required',
      });
    }

    await imageService.deleteImage(imageUrl, entityType as EntityType, entityId);

    res.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    next(error);
  }
  return;
});

/**
 * GET /api/images/:entityType/:entityId
 * List all images for an entity
 */
router.get('/:entityType/:entityId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params;

    const images = await imageService.listImages(entityType as EntityType, entityId);

    res.json({
      success: true,
      data: images,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
