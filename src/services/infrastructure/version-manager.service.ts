import supabase from '../../config/supabase';
import { logger } from '../../utils/logger';

/**
 * Version Manager Service
 *
 * Responsibility: Manage entity versioning
 * - Get current version for any entity
 * - Calculate next version
 * - Handle version-related queries
 */
export class VersionManagerService {
  /**
   * Get the current version for an entity
   * Returns 1 for new entities that don't exist yet
   */
  async getCurrentVersion(
    tableName: 'pins' | 'forms',
    entityId: string | undefined
  ): Promise<number> {
    if (!entityId) {
      return 1; // New entity
    }

    try {
      const { data: existing, error } = await supabase
        .from(tableName)
        .select('version')
        .eq('id', entityId)
        .single();

      if (error) {
        // Entity doesn't exist or error fetching
        if (error.code === 'PGRST116') {
          // No rows returned - entity doesn't exist
          return 1;
        }

        logger.warn('Could not fetch existing version', { tableName, entityId, error });
        return 1;
      }

      return existing ? existing.version || 1 : 1;
    } catch (error) {
      logger.error('Error getting current version', { tableName, entityId, error });
      return 1; // Default to version 1 on error
    }
  }

  /**
   * Get the next version for an entity (current + 1)
   */
  async getNextVersion(tableName: 'pins' | 'forms', entityId: string | undefined): Promise<number> {
    const currentVersion = await this.getCurrentVersion(tableName, entityId);
    return currentVersion + 1;
  }

  /**
   * Validate that an update operation has a newer version
   * Returns true if the new version is valid (greater than current)
   */
  async validateVersion(
    tableName: 'pins' | 'forms',
    entityId: string,
    newVersion: number
  ): Promise<boolean> {
    const currentVersion = await this.getCurrentVersion(tableName, entityId);
    return newVersion > currentVersion;
  }

  /**
   * Get versions for multiple entities in batch
   */
  async getBatchVersions(
    tableName: 'pins' | 'forms',
    entityIds: string[]
  ): Promise<Map<string, number>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('id, version')
        .in('id', entityIds);

      if (error) {
        logger.error('Error fetching batch versions', { tableName, entityIds, error });
        return new Map();
      }

      const versionMap = new Map<string, number>();

      if (data) {
        for (const item of data) {
          versionMap.set(item.id, item.version || 1);
        }
      }

      return versionMap;
    } catch (error) {
      logger.error('Error in getBatchVersions', { tableName, error });
      return new Map();
    }
  }
}

export const versionManagerService = new VersionManagerService();
