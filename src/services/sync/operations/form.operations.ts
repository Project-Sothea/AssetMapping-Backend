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

    const nextVersion = await versionManagerService.getNextVersion('forms', data.id);
    const formData = this.prepareFormData(data, nextVersion);

    const { data: result, error } = await supabase
      .from('forms')
      .upsert(formData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('Error syncing form', { error, data });
      throw error;
    }

    logger.info('Form synced successfully', { formId: result.id, version: nextVersion });
    return result as FormData;
  }

  /**
   * Prepare form data with status and timestamps
   */
  private prepareFormData(data: FormData, version: number): FormData {
    const isCreate = !data.id;
    const now = new Date().toISOString();

    return {
      ...data,
      version,
      status: data.status || 'synced',
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
    } as FormData;
  }
}

export const formOperations = new FormOperations();
