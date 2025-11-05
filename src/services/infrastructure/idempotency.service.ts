import { redisClient } from '../../config/redis';
import { ConflictError } from '../../types';
import { logger } from '../../utils/logger';
import { safeJsonParse } from '../../utils/parsing';
import { distributedLockService } from './distributed-lock.service';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

/**
 * Idempotency Service
 *
 * Responsibility: Manage idempotency keys and results
 * - Check if request was already processed
 * - Store and retrieve idempotent results
 * - Process requests with idempotency guarantees
 * - Graceful degradation when Redis unavailable
 */
export class IdempotencyService {
  private redisAvailable = true;
  private lastRedisFailure = 0;

  /**
   * Check if Redis is in circuit breaker state
   */
  private isCircuitOpen(): boolean {
    if (!this.redisAvailable) {
      const timeSinceFailure = Date.now() - this.lastRedisFailure;
      if (timeSinceFailure > CIRCUIT_BREAKER_TIMEOUT) {
        // Try to reconnect
        this.redisAvailable = true;
        logger.info('Circuit breaker closed, allowing Redis operations');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Handle Redis error and open circuit breaker
   */
  private handleRedisError(error: unknown, operation: string): void {
    logger.error(`Redis ${operation} failed, opening circuit breaker`, { error });
    this.redisAvailable = false;
    this.lastRedisFailure = Date.now();
  }
  /**
   * Check if an idempotency key has already been processed
   */
  async checkIdempotency(key: string): Promise<boolean> {
    if (this.isCircuitOpen()) {
      logger.warn('Redis circuit breaker open, skipping idempotency check');
      return false;
    }

    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      const exists = await redisClient.exists(redisKey);
      return exists === 1;
    } catch (error) {
      this.handleRedisError(error, 'checkIdempotency');
      throw new Error('Idempotency service unavailable. Please try again.');
    }
  }

  /**
   * Get the result of a previously processed idempotent request
   */
  async getIdempotentResult(key: string): Promise<unknown | null> {
    if (this.isCircuitOpen()) {
      logger.warn('Redis circuit breaker open, skipping cache lookup');
      return null;
    }

    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      const result = await redisClient.get(redisKey);
      return result ? safeJsonParse(result, null) : null;
    } catch (error) {
      this.handleRedisError(error, 'getIdempotentResult');
      // Return null instead of throwing - allow operation to proceed
      return null;
    }
  }

  /**
   * Store the result of an idempotent request
   */
  async storeIdempotentResult(key: string, result: unknown): Promise<void> {
    if (this.isCircuitOpen()) {
      logger.warn('Redis circuit breaker open, skipping cache storage');
      return;
    }

    try {
      const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
      await redisClient.setEx(redisKey, IDEMPOTENCY_TTL, JSON.stringify(result));
      logger.debug('Stored idempotent result', { key });
    } catch (error) {
      this.handleRedisError(error, 'storeIdempotentResult');
      // Don't throw - storage failure shouldn't fail the operation
      logger.warn('Failed to store idempotent result, continuing without cache');
    }
  }

  /**
   * Process a request with idempotency
   * If the request has already been processed, return the stored result
   * Otherwise, execute the handler and store the result
   * Handles Redis failures gracefully
   */
  async processWithIdempotency<T>(key: string, handler: () => Promise<T>): Promise<T> {
    // Check if already processed (gracefully handles Redis failure)
    const existing = await this.getIdempotentResult(key);
    if (existing) {
      logger.info('Returning cached idempotent result', { key });
      return existing as T;
    }

    // Use distributed lock service to ensure only one request processes
    const lockKey = `${IDEMPOTENCY_PREFIX}lock:${key}`;
    let lockAcquired = false;

    try {
      lockAcquired = await distributedLockService.acquire(lockKey);
    } catch (error) {
      // If lock acquisition fails due to Redis being down, allow operation to proceed
      // without locking (risky but better than failing all requests)
      logger.warn('Failed to acquire lock, proceeding without it', { key, error });
      lockAcquired = false;
    }

    if (lockAcquired) {
      try {
        // Double-check result (might have been set while waiting for lock)
        const existingAfterLock = await this.getIdempotentResult(key);
        if (existingAfterLock) {
          logger.info('Returning cached idempotent result (after lock)', { key });
          return existingAfterLock as T;
        }

        // Execute the handler
        const result = await handler();

        // Store the result (gracefully handles storage failure)
        await this.storeIdempotentResult(key, result);

        return result;
      } finally {
        // Always release the lock
        await distributedLockService.release(lockKey);
      }
    } else {
      // Lock not acquired - another request is processing or lock service unavailable
      if (!this.isCircuitOpen()) {
        // If Redis is available, this means another request is processing
        throw new ConflictError('Request is already being processed. Please try again later.');
      }

      // 🚨 CRITICAL: Do NOT execute without lock - risk of duplicate operations
      // Better to fail the request than create duplicate data
      logger.error('Redis unavailable - cannot acquire idempotency lock', { key });
      throw new Error(
        'Service temporarily unavailable. Idempotency service (Redis) is down. ' +
          'Please retry in a few moments.'
      );
    }
  }
}

export const idempotencyService = new IdempotencyService();
