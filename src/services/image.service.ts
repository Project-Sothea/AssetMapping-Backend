import supabase from '../config/supabase';
import { config } from '../config';
import { ImageUploadRequest, SignedUrlResponse, EntityType } from '../types';
import { logger } from '../utils/logger';
import { eventService } from './event.service';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { outboxRepository } from '../repositories/outbox.repository';
import { ImageUploadedEventSchema } from '../types/events';

const BUCKET_NAME = 'images';

export interface ImageConfirmation {
  imageUrl: string;
  entityType: EntityType;
  entityId: string;
  sizeBytes: number;
  mimeType: string;
  userId: string;
}

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
   * Process an uploaded image (resize, optimize)
   * Called after the client uploads to the signed URL
   */
  async processImage(imageUrl: string, entityType: EntityType, entityId: string): Promise<string> {
    logger.info('Processing image', { imageUrl, entityType, entityId });

    try {
      // Download the image from Supabase
      const path = this.extractPathFromUrl(imageUrl);
      const { data: imageBuffer, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .download(path);

      if (downloadError || !imageBuffer) {
        throw downloadError || new Error('Failed to download image');
      }

      // Convert to buffer
      const buffer = Buffer.from(await imageBuffer.arrayBuffer());

      // Process with Sharp - resize and optimize
      const processedBuffer = await sharp(buffer)
        .resize(1920, 1920, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({
          quality: config.images.quality,
          progressive: true,
        })
        .toBuffer();

      // Upload processed image back
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .update(path, processedBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      logger.info('Image processed successfully', { path });

      // Publish event
      await eventService.publishImageEvent({
        eventType: 'image.processed',
        imageUrl,
        entityType,
        entityId,
        metadata: {
          originalSize: buffer.length,
          processedSize: processedBuffer.length,
        },
      });

      return imageUrl;
    } catch (error) {
      logger.error('Error processing image', { error, imageUrl });
      throw error;
    }
  }

  /**
   * Delete an image from storage
   */
  async deleteImage(imageUrl: string, entityType: EntityType, entityId: string): Promise<void> {
    logger.info('Deleting image', { imageUrl });

    try {
      const path = this.extractPathFromUrl(imageUrl);

      const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

      if (error) {
        throw error;
      }

      logger.info('Image deleted successfully', { path });

      // Publish event
      await eventService.publishImageEvent({
        eventType: 'image.deleted',
        imageUrl,
        entityType,
        entityId,
      });
    } catch (error) {
      logger.error('Error deleting image', { error, imageUrl });
      throw error;
    }
  }

  /**
   * Confirm image upload and emit ImageUploaded event
   * Called after client successfully uploads to signed URL
   */
  async confirmImageUpload(confirmation: ImageConfirmation): Promise<{
    imageId: string;
    eventId: string;
  }> {
    logger.info('Confirming image upload', {
      imageUrl: confirmation.imageUrl,
      entityType: confirmation.entityType,
      entityId: confirmation.entityId,
    });

    try {
      // Verify image exists in storage
      const path = this.extractPathFromUrl(confirmation.imageUrl);
      const { data: fileData, error: existsError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(path.split('/').slice(0, -1).join('/'), {
          search: path.split('/').pop(),
        });

      if (existsError || !fileData || fileData.length === 0) {
        throw new Error('Image not found in storage');
      }

      // Generate image ID
      const imageId = uuidv4();

      // Extract filename from URL
      const filename = path.split('/').pop() || 'unknown';

      // Create ImageUploaded event
      const event = ImageUploadedEventSchema.parse({
        eventId: uuidv4(),
        aggregateId: confirmation.entityId,
        aggregateType: confirmation.entityType,
        type: 'ImageUploaded',
        version: 1, // Images don't have versions, use 1
        timestamp: new Date().toISOString(),
        payload: {
          imageId,
          entityType: confirmation.entityType,
          entityId: confirmation.entityId,
          url: confirmation.imageUrl,
          filename,
          sizeBytes: confirmation.sizeBytes,
          mimeType: confirmation.mimeType,
          uploadedBy: confirmation.userId,
          uploadedAt: new Date().toISOString(),
        },
      });

      // Insert event into outbox
      await outboxRepository.insertEvent(event);

      logger.info('Image upload confirmed and event published', {
        imageId,
        eventId: event.eventId,
      });

      return {
        imageId,
        eventId: event.eventId,
      };
    } catch (error) {
      logger.error('Error confirming image upload', { error, confirmation });
      throw error;
    }
  }

  /**
   * Extract storage path from public URL
   */
  private extractPathFromUrl(url: string): string {
    const urlParts = url.split('/');
    const bucketIndex = urlParts.findIndex((part) => part === BUCKET_NAME);
    return urlParts.slice(bucketIndex + 1).join('/');
  }

  /**
   * List images for an entity
   */
  async listImages(entityType: EntityType, entityId: string): Promise<string[]> {
    const prefix = `${entityType}/${entityId}/`;

    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(prefix);

    if (error) {
      logger.error('Error listing images', { error, prefix });
      throw error;
    }

    // Convert to public URLs
    return (data || []).map((file) => {
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(`${prefix}${file.name}`);
      return publicUrlData.publicUrl;
    });
  }
}

export const imageService = new ImageService();
