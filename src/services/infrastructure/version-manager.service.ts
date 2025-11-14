import { logger } from '../../utils/logger';
import { FormService } from '../form.service';
import { PinService } from '../pin.service';

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
      const version =
        tableName === 'forms'
          ? await FormService.getFormVersion(entityId)
          : await PinService.getPinVersion(entityId);
      return version ?? 1;
    } catch (error) {
      logger.warn('Could not fetch existing version', { tableName, entityId, error });
      return 1;
    }
  }
}

export const versionManagerService = new VersionManagerService();
