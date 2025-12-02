import { unlink } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export class ImageService {
  /**
   * Delete an image by pinId and fileName from uploads/pin/{pinId}/{fileName}
   */
  async deleteImage(pinId: string, fileName: string): Promise<void> {
    const filePath = join(UPLOADS_DIR, 'pin', pinId, fileName);
    try {
      logger.info('Deleting image from filesystem', { path: filePath });
      await unlink(filePath);
      logger.info('Image deleted successfully', { path: filePath });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn('Image file not found, skipping deletion', { path: filePath });
        return;
      }
      logger.error('Exception while deleting image', { error, path: filePath });
      throw error;
    }
  }
  // Removed URL/relative-path parsing: use pinId + fileName exclusively

  /**
   * Delete multiple images from local filesystem
   * Throws error if any deletion fails
   */
  async deleteImages(pinId: string, filenames: string[]): Promise<void> {
    logger.info('Deleting multiple images', { pinId, count: filenames.length });

    // Delete in parallel for better performance
    await Promise.all(filenames.map((name) => this.deleteImage(pinId, name)));

    logger.info('Batch image deletion completed', { pinId, count: filenames.length });
  }
}

export const imageService = new ImageService();
