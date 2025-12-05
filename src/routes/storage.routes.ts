import { Router } from 'express';
import { StorageController } from '../controllers/storage.controller';

const router = Router();

/**
 * GET /api/storage/upload-url?key=<object key>&mimeType=<mime type>
 * Returns a short-lived signed PUT URL for uploading to private bucket.
 */
router.get('/upload-url', StorageController.getUploadUrl);

/**
 * GET /api/storage/download-url?key=<object key>
 * Returns a short-lived signed GET URL for downloading from private bucket.
 */
router.get('/download-url', StorageController.getDownloadUrl);

/**
 * DELETE /api/storage/objects
 * Body: { keys: string[] }
 * Server-side deletion of objects by key.
 */
router.delete('/objects', StorageController.deleteObjects);

export default router;
