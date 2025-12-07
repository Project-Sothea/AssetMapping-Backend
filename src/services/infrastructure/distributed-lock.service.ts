import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

const LOCK_PREFIX = 'lock:';
const DEFAULT_TTL = 30; // 30 seconds - reduced from 5 minutes to handle concurrent requests better

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
}

export const distributedLockService = new DistributedLockService();
