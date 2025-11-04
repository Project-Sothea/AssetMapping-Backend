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
}

export const imageService = new ImageService();
