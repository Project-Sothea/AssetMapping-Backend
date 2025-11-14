import { PinData } from '../../../types';
import { imageService } from '../../image.service';
import { PinService } from '../../pin.service';
import { logger } from '../../../utils/logger';
import { BaseOperations, EntityType } from './base.operations';

/**
 * Pin Operations Service
 */
export class PinOperations extends BaseOperations<PinData> {
  getEntityType(): EntityType {
    return 'pins';
  }

  async getUpdatedAt(id: string): Promise<string | null> {
    return PinService.getPinUpdatedAt(id);
  }

  async getVersion(id: string): Promise<number | null> {
    return PinService.getPinVersion(id);
  }

  async performUpsert(data: PinData, version: number): Promise<PinData> {
    // Collect images to delete BEFORE making changes
    let imagesToDelete: string[] = [];
    if (data.id) {
      imagesToDelete = await PinService.getImagesToDelete(data.id, data.images);
    }

    const result = await PinService.upsertPin(data, version);

    // Cleanup images after DB write
    if (imagesToDelete.length > 0) {
      try {
        logger.info('Deleting images after successful pin update', {
          pinId: result.id,
          count: imagesToDelete.length,
        });
        await imageService.deleteImages(imagesToDelete);
        logger.info('Image cleanup completed successfully', {
          pinId: result.id,
          deletedCount: imagesToDelete.length,
        });
      } catch (error) {
        logger.error('Image cleanup failed after pin update', {
          error,
          pinId: result.id,
          orphanedImages: imagesToDelete,
          message: 'Images may need manual cleanup',
        });
      }
    }

    return result as PinData;
  }

  async performDelete(id: string): Promise<void> {
    const imageUrls = await PinService.getPinImages(id);
    await PinService.deletePin(id);
    if (imageUrls.length > 0) {
      try {
        logger.info('Deleting images after successful pin delete', {
          pinId: id,
          count: imageUrls.length,
        });
        await imageService.deleteImages(imageUrls);
        logger.info('Image cleanup completed successfully', {
          pinId: id,
          deletedCount: imageUrls.length,
        });
      } catch (error) {
        logger.error('Image cleanup failed after pin delete', {
          error,
          pinId: id,
          orphanedImages: imageUrls,
          message: 'Images may need manual cleanup',
        });
      }
    }
  }
}

export const pinOperations = new PinOperations();
