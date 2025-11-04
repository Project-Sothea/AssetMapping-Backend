import { redisClient } from '../../config/redis';
import { ConflictError } from '../../types';
import { logger } from '../../utils/logger';
import { safeJsonParse } from '../../utils/parsing';
import { distributedLockService } from './distributed-lock.service';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

/**
 * Idempotency Service
 *
 * Responsibility: Manage idempotency keys and results
 * - Check if request was already processed
 * - Store and retrieve idempotent results
 * - Process requests with idempotency guarantees
 */
export class IdempotencyService {
  /**
   * Check if an idempotency key has already been processed
   */
  async checkIdempotency(key: string): Promise<boolean> {
    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      const exists = await redisClient.exists(redisKey);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking idempotency', { key, error });
      throw error;
    }
  }

  /**
   * Get the result of a previously processed idempotent request
   */
  async getIdempotentResult(key: string): Promise<unknown | null> {
    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      const result = await redisClient.get(redisKey);
      return result ? safeJsonParse(result, null) : null;
    } catch (error) {
      logger.error('Error getting idempotent result', { key, error });
      throw error;
    }
  }

  /**
   * Store the result of an idempotent request
   */
  async storeIdempotentResult(key: string, result: unknown): Promise<void> {
    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      await redisClient.setEx(redisKey, IDEMPOTENCY_TTL, JSON.stringify(result));
      logger.debug('Stored idempotent result', { key });
    } catch (error) {
      logger.error('Error storing idempotent result', { key, error });
      throw error;
    }
  }

  /**
   * Process a request with idempotency
   * If the request has already been processed, return the stored result
   * Otherwise, execute the handler and store the result
   */
  async processWithIdempotency<T>(key: string, handler: () => Promise<T>): Promise<T> {
    // Check if already processed
    const existing = await this.getIdempotentResult(key);
    if (existing) {
      logger.info('Returning cached idempotent result', { key });
      return existing as T;
    }

    // Use distributed lock service to ensure only one request processes
    const lockKey = `${IDEMPOTENCY_PREFIX}lock:${key}`;
    const lockAcquired = await distributedLockService.acquire(lockKey);

    if (!lockAcquired) {
      throw new ConflictError('Request is already being processed. Please try again later.');
    }

    try {
      // Double-check result (might have been set while waiting for lock)
      const existingAfterLock = await this.getIdempotentResult(key);
      if (existingAfterLock) {
        logger.info('Returning cached idempotent result (after lock)', { key });
        return existingAfterLock as T;
      }

      // Execute the handler
      const result = await handler();

      // Store the result
      await this.storeIdempotentResult(key, result);

      return result;
    } finally {
      // Always release the lock
      await distributedLockService.release(lockKey);
    }
  }
}

export const idempotencyService = new IdempotencyService();
