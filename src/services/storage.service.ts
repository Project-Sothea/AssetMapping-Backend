import {
  S3Client,
  DeleteObjectsCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from '../config';
import { logger } from '../utils/logger';

function getS3Client(): S3Client {
  return new S3Client({
    region: config.images.s3.region,
    endpoint: config.images.s3.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: String(config.images.s3.accessKeyId),
      secretAccessKey: String(config.images.s3.secretAccessKey),
    },
  });
}

export class StorageService {
  static async getUploadUrl(key: string, mimeType: string): Promise<string> {
    if (!key || !mimeType) {
      throw new Error('Missing required fields: key, mimeType');
    }
    if (!config.images.s3.bucket) {
      throw new Error('S3 bucket not configured');
    }
    const s3 = getS3Client();
    const command = new PutObjectCommand({
      Bucket: config.images.s3.bucket,
      Key: key,
      ContentType: mimeType,
    });
    const url = await getSignedUrl(s3, command);
    logger.info('Generated presigned upload URL', { key });
    return url;
  }

  static async getDownloadUrl(key: string): Promise<string> {
    if (!key) {
      throw new Error('Missing key');
    }
    if (!config.images.s3.bucket) {
      throw new Error('S3 bucket not configured');
    }
    const s3 = getS3Client();
    const command = new GetObjectCommand({ Bucket: config.images.s3.bucket, Key: key });
    const url = await getSignedUrl(s3, command);
    logger.info('Generated presigned download URL', { key });
    return url;
  }

  static async deleteByKeys(keys: string[]): Promise<{ deleted: number; errors: number }> {
    if (!keys || keys.length === 0) {
      return { deleted: 0, errors: 0 };
    }

    if (!config.images.s3.bucket) {
      logger.error('S3 bucket not configured for deletion');
      throw new Error('S3 bucket not configured');
    }

    const objects = keys.filter((k) => !!k).map((Key) => ({ Key }));

    const s3 = getS3Client();
    try {
      const command = new DeleteObjectsCommand({
        Bucket: config.images.s3.bucket,
        Delete: { Objects: objects, Quiet: true },
      });

      const result = await s3.send(command);
      const deleted = result.Deleted?.length || 0;
      const errors = result.Errors?.length || 0;

      if (errors > 0) {
        logger.warn('Some S3 deletes failed', { errors: result.Errors });
      }
      logger.info('Deleted images from bucket', { deleted, requested: keys.length });
      return { deleted, errors };
    } catch (error) {
      logger.error('Error deleting images from bucket', { error, count: keys.length });
      throw error;
    }
  }
}
