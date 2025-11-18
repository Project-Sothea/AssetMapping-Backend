import { Router, Request, Response, NextFunction } from 'express';
import { syncService } from '../services/sync';
import { SyncItemRequestSchema, SyncItemRequest } from '../types';
import { logger } from '../utils/logger';
import multer from 'multer';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Parse the 'data' field to get entityType and entityId
    const data = JSON.parse(req.body.data || '{}');
    const entityType = data.entityType || 'unknown';
    const entityId = data.payload?.id || uuidv4();
    console.log('Uploading image for', entityType, entityId);
    
    const uploadPath = join(process.cwd(), 'uploads', entityType, entityId);
    await mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Use the original filename, which should be the UUID from the frontend
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

/**
 * POST /api/sync/item
 * Sync a single item (pin or form) with idempotency support
 * Handles create, update, and delete operations
 * Accepts multipart/form-data with 'data' field (JSON) and optional 'images' files
 */
router.post(
  '/item',
  upload.array('images', 10), // Allow up to 10 images
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse the data field
      const request: SyncItemRequest = JSON.parse(req.body.data || '{}');
      
      // Validate the parsed data
      const validatedRequest = SyncItemRequestSchema.parse(request);

      logger.info('Sync item request received', {
        idempotencyKey: validatedRequest.idempotencyKey,
        entityType: validatedRequest.entityType,
        operation: validatedRequest.operation,
        imageCount: req.files?.length || 0,
      });

      // Pass uploaded files to sync service
      const result = await syncService.syncItem(validatedRequest, req.files as Express.Multer.File[]);

      res.json({
        success: true,
        data: result,
        idempotencyKey: validatedRequest.idempotencyKey,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
