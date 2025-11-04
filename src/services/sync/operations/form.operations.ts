import supabase from '../../../config/supabase';
import { FormData, OperationType } from '../../../types';
import { logger } from '../../../utils/logger';
import { versionManagerService } from '../../infrastructure/version-manager.service';

/**
 * Form Operations Service
 *
 * Responsibility: Handle database operations for forms
 * - Create, update, delete forms
 * - Prepare form data for storage
 * - Coordinate with version manager
 */
export class FormOperations {
  /**
   * Sync a form to the database (with version tracking)
   */
  async syncForm(
    operation: OperationType,
    data: FormData
  ): Promise<FormData | { id: string; deleted: boolean }> {
    logger.info('Syncing form', { operation, formId: data.id });

    if (operation === 'delete') {
      return this.deleteForm(data.id);
    }

    return this.upsertForm(data);
  }

  /**
   * Delete a form from the database (soft delete)
   */
  private async deleteForm(formId: string | undefined): Promise<{ id: string; deleted: boolean }> {
    if (!formId) {
      throw new Error('Form ID is required for delete operation');
    }

    // Soft delete by setting deletedAt timestamp
    const { error } = await supabase
      .from('forms')
      .update({ deletedAt: new Date().toISOString() })
      .eq('id', formId);

    if (error) throw error;

    return { id: formId, deleted: true };
  }

  /**
   * Create or update a form in the database
   * Uses Last-Write-Wins conflict resolution based on updatedAt timestamp
   */
  private async upsertForm(data: FormData): Promise<FormData> {
    // Check for version conflicts - use timestamp to resolve
    if (data.id && data.version) {
      const currentVersion = await versionManagerService.getCurrentVersion('forms', data.id);

      if (currentVersion > 0 && data.version < currentVersion) {
        // Fetch current server data to compare timestamps
        const { data: serverData } = await supabase
          .from('forms')
          .select('updatedAt')
          .eq('id', data.id)
          .single();

        if (serverData) {
          const clientTime = new Date(data.updatedAt || 0).getTime();
          const serverTime = new Date(serverData.updatedAt || 0).getTime();

          // If server data is newer, reject the update
          if (serverTime >= clientTime) {
            logger.warn('Rejecting older update - server data is newer', {
              formId: data.id,
              clientVersion: data.version,
              serverVersion: currentVersion,
              clientTime: new Date(clientTime).toISOString(),
              serverTime: new Date(serverTime).toISOString(),
            });

            throw new Error(
              `Conflict: Server has newer data (updated ${new Date(serverTime).toISOString()}). ` +
                `Your changes are from ${new Date(clientTime).toISOString()}. Please pull latest data.`
            );
          }

          // Client data is newer - allow it to overwrite (Last-Write-Wins)
          logger.info('Accepting newer update despite version conflict', {
            formId: data.id,
            clientVersion: data.version,
            serverVersion: currentVersion,
            clientTime: new Date(clientTime).toISOString(),
            serverTime: new Date(serverTime).toISOString(),
          });
        }
      }
    }

    // Determine version: check if entity exists in database
    let version = 1; // Default for new entities

    if (data.id) {
      const { data: existing } = await supabase
        .from('forms')
        .select('version')
        .eq('id', data.id)
        .single();

      if (existing) {
        // Entity exists - increment version
        version = (existing.version || 1) + 1;
        logger.info('Incrementing version for existing form', {
          formId: data.id,
          oldVersion: existing.version,
          newVersion: version,
        });
      } else {
        // Entity doesn't exist - use version 1
        logger.info('Creating new form with version 1', { formId: data.id });
      }
    } else {
      logger.info('Creating new form without ID (will be assigned by DB)');
    }

    const formData = this.prepareFormData(data, version);

    const { data: result, error } = await supabase
      .from('forms')
      .upsert(formData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing form', { error, data });
      throw error;
    }

    logger.info('Form synced successfully', { formId: result.id, version: result.version });
    return result as FormData;
  }

  /**
   * Prepare form data with status and timestamps
   * Excludes local-only columns that should not be saved to the database
   */
  private prepareFormData(data: FormData, version: number): FormData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    // Create a copy and exclude local-only columns
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { failureReason, lastSyncedAt, lastFailedSyncAt, ...cleanData } = data;

    return {
      ...cleanData,
      version,
      status: data.status || 'synced',
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as FormData;
  }
}

export const formOperations = new FormOperations();
