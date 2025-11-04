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
   * Delete a form from the database
   */
  private async deleteForm(formId: string | undefined): Promise<{ id: string; deleted: boolean }> {
    if (!formId) {
      throw new Error('Form ID is required for delete operation');
    }

    const { error } = await supabase.from('forms').delete().eq('id', formId);
    if (error) throw error;

    return { id: formId, deleted: true };
  }

  /**
   * Create or update a form in the database
   */
  private async upsertForm(data: FormData): Promise<FormData> {
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
