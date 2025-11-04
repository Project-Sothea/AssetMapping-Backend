import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

const LOCK_PREFIX = 'lock:';
const DEFAULT_TTL = 300; // 5 minutes

/**
 * Distributed Lock Service
 *
 * Responsibility: Manage distributed locks using Redis
 * - Acquire locks with TTL
 * - Release locks
 * - Handle lock expiration
 */
export class DistributedLockService {
  /**
   * Acquire a distributed lock
   * Returns true if lock was acquired, false if already locked
   */
  async acquire(key: string, ttlSeconds: number = DEFAULT_TTL): Promise<boolean> {
    try {
      const lockKey = `${LOCK_PREFIX}${key}`;
      const acquired = await redisClient.set(lockKey, '1', {
        NX: true,
        EX: ttlSeconds,
      });

      if (acquired === 'OK') {
        logger.debug('Lock acquired', { key, ttl: ttlSeconds });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error acquiring lock', { key, error });
      throw error;
    }
  }

  /**
   * Release a distributed lock
   */
  async release(key: string): Promise<void> {
    try {
      const lockKey = `${LOCK_PREFIX}${key}`;
      await redisClient.del(lockKey);
      logger.debug('Lock released', { key });
    } catch (error) {
      logger.error('Error releasing lock', { key, error });
      // Don't throw - releasing a lock should be best-effort
    }
  }

  /**
   * Check if a lock exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const lockKey = `${LOCK_PREFIX}${key}`;
      const exists = await redisClient.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking lock existence', { key, error });
      throw error;
    }
  }

  /**
   * Extend the TTL of an existing lock
   */
  async extend(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const lockKey = `${LOCK_PREFIX}${key}`;
      const result = await redisClient.expire(lockKey, ttlSeconds);

      if (result) {
        logger.debug('Lock TTL extended', { key, ttl: ttlSeconds });
      }

      return result;
    } catch (error) {
      logger.error('Error extending lock TTL', { key, error });
      throw error;
    }
  }

  /**
   * Execute a function with a lock (automatically acquire and release)
   */
  async withLock<T>(
    key: string,
    handler: () => Promise<T>,
    ttlSeconds: number = DEFAULT_TTL
  ): Promise<T> {
    const acquired = await this.acquire(key, ttlSeconds);

    if (!acquired) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await handler();
    } finally {
      await this.release(key);
    }
  }
}

export const distributedLockService = new DistributedLockService();
