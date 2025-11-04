import supabase from '../config/supabase';
import { config } from '../config';
import { ImageUploadRequest, SignedUrlResponse } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = 'images';

export class ImageService {
  /**
   * Generate a signed URL for image upload
   */
  async getSignedUploadUrl(request: ImageUploadRequest): Promise<SignedUrlResponse> {
    logger.info('Generating signed upload URL', {
      filename: request.filename,
      entityType: request.entityType,
      entityId: request.entityId,
    });

    // Validate file size
    const maxSizeBytes = config.images.maxSizeMB * 1024 * 1024;
    if (request.sizeBytes > maxSizeBytes) {
      throw new Error(`File size ${request.sizeBytes} bytes exceeds maximum ${maxSizeBytes} bytes`);
    }

    // Generate unique filename
    const extension = request.filename.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${extension}`;
    const path = `${request.entityType}/${request.entityId}/${uniqueFilename}`;

    // Generate signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUploadUrl(path);

    if (error || !data) {
      logger.error('Error creating signed upload URL', { error, path });
      throw error || new Error('Failed to create signed upload URL');
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    const response: SignedUrlResponse = {
      uploadUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      token: data.token,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    };

    logger.info('Signed upload URL generated', { path });
    return response;
  }

  /**
   * Delete an image from Supabase storage by its public URL
   */
  async deleteImageByUrl(publicUrl: string): Promise<void> {
    try {
      // Extract the path from the public URL
      // Example URL: https://abc.supabase.co/storage/v1/object/public/images/pin/uuid/filename.jpg
      const urlParts = publicUrl.split('/storage/v1/object/public/images/');
      if (urlParts.length < 2) {
        logger.warn('Invalid image URL format, skipping deletion', { publicUrl });
        return;
      }

      const path = urlParts[1];
      logger.info('Deleting image from storage', { path });

      const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

      if (error) {
        logger.error('Error deleting image from storage', { error, path });
        // Don't throw - deletion failure shouldn't block pin updates
      } else {
        logger.info('Image deleted successfully', { path });
      }
    } catch (error) {
      logger.error('Exception while deleting image', { error, publicUrl });
      // Don't throw - deletion failure shouldn't block pin updates
    }
  }

  /**
   * Delete multiple images from Supabase storage
   */
  async deleteImages(publicUrls: string[]): Promise<void> {
    logger.info('Deleting multiple images', { count: publicUrls.length });

    // Delete in parallel for better performance
    await Promise.all(publicUrls.map((url) => this.deleteImageByUrl(url)));

    logger.info('Batch image deletion completed', { count: publicUrls.length });
  }
}

export const imageService = new ImageService();
