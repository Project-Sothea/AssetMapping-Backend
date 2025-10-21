import { redisClient } from '../config/redis';
import { ConflictError } from '../types';
import { logger } from '../utils/logger';
import { safeJsonParse } from '../utils/parsing';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

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
   * Acquire a lock for processing an idempotent request
   * Returns true if lock was acquired, false if already processing
   */
  async acquireLock(key: string, ttlSeconds: number = 300): Promise<boolean> {
    try {
      const lockKey = `${IDEMPOTENCY_PREFIX}lock:${key}`;
      const acquired = await redisClient.set(lockKey, '1', {
        NX: true,
        EX: ttlSeconds,
      });
      return acquired === 'OK';
    } catch (error) {
      logger.error('Error acquiring idempotency lock', { key, error });
      throw error;
    }
  }

  /**
   * Release an idempotency lock
   */
  async releaseLock(key: string): Promise<void> {
    try {
      const lockKey = `${IDEMPOTENCY_PREFIX}lock:${key}`;
      await redisClient.del(lockKey);
      logger.debug('Released idempotency lock', { key });
    } catch (error) {
      logger.error('Error releasing idempotency lock', { key, error });
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

    // Try to acquire lock
    const lockAcquired = await this.acquireLock(key);
    if (!lockAcquired) {
      throw new ConflictError('Request is already being processed. Please try again later.');
    }

    try {
      // Execute the handler
      const result = await handler();

      // Store the result
      await this.storeIdempotentResult(key, result);

      return result;
    } finally {
      // Always release the lock
      await this.releaseLock(key);
    }
  }
}

export const idempotencyService = new IdempotencyService();
