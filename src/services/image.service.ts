import { unlink } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export class ImageService {
  /**
   * Delete an image from local filesystem by relative path or URL
   * Throws error if deletion fails (for proper error handling in operations)
   */
  async deleteImageByUrl(pathOrUrl: string): Promise<void> {
    try {
      // Handle both relative paths and full URLs for backwards compatibility
      let relativePath: string;
      
      if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        // Full URL: extract path after /uploads/
        const urlParts = pathOrUrl.split('/uploads/');
        if (urlParts.length < 2) {
          logger.warn('Invalid image URL format, skipping deletion', { url: pathOrUrl });
          return;
        }
        relativePath = urlParts[1];
      } else {
        // Already a relative path: "pin/123/abc.jpg"
        relativePath = pathOrUrl;
      }

      const filePath = join(UPLOADS_DIR, relativePath);
      
      logger.info('Deleting image from filesystem', { path: filePath });

      try {
        await unlink(filePath);
        logger.info('Image deleted successfully', { path: filePath });
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          logger.warn('Image file not found, skipping deletion', { path: filePath });
          return;
        }
        throw error;
      }
    } catch (error) {
      logger.error('Exception while deleting image', { error, publicUrl });
      throw error;
    }
  }

  /**
   * Delete multiple images from local filesystem
   * Throws error if any deletion fails
   */
  async deleteImages(publicUrls: string[]): Promise<void> {
    logger.info('Deleting multiple images', { count: publicUrls.length });

    // Delete in parallel for better performance
    await Promise.all(publicUrls.map((url) => this.deleteImageByUrl(url)));

    logger.info('Batch image deletion completed', { count: publicUrls.length });
  }
}

export const imageService = new ImageService();
