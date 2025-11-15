import { db } from '../db'; // Import the Drizzle db instance
import { forms } from '../db/schema'; // Import the forms table schema
import { eq, isNull, desc, gte, and } from 'drizzle-orm'; // Import Drizzle query helpers
import { logger } from '../utils/logger';
import { FormData } from '../types';

export class FormService {
  static async getAllForms() {
    logger.info('Fetching all forms');
    try {
      const data = await db
        .select()
        .from(forms)
        .where(isNull(forms.deletedAt))
        .orderBy(desc(forms.createdAt));

      logger.info('Successfully fetched forms', { count: data?.length || 0 });
      return data || [];
    } catch (error) {
      logger.error('Error fetching forms', { error });
      throw error;
    }
  }

  static async getFormsSince(timestamp: number) {
    logger.info('Fetching forms since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    try {
      const data = await db
        .select()
        .from(forms)
        .where(and(isNull(forms.deletedAt), gte(forms.updatedAt, date)))
        .orderBy(forms.updatedAt);

      logger.info('Successfully fetched forms since timestamp', {
        timestamp,
        count: data?.length || 0,
      });
      return data || [];
    } catch (error) {
      logger.error('Error fetching forms since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getFormById(id: string) {
    logger.info('Fetching single form', { formId: id });
    try {
      const data = await db
        .select()
        .from(forms)
        .where(and(eq(forms.id, id), isNull(forms.deletedAt)))
        .limit(1);

      if (!data || data.length === 0) {
        logger.warn('Form not found', { formId: id });
        throw new Error('Form not found');
      }

      logger.info('Successfully fetched form', { formId: id });
      return data[0];
    } catch (error) {
      logger.error('Error fetching form', { error, formId: id });
      throw error;
    }
  }

  /**
   * Soft delete a form by setting deletedAt
   */
  static async deleteForm(formId: string): Promise<void> {
    try {
      await db.update(forms).set({ deletedAt: new Date() }).where(eq(forms.id, formId));
    } catch (error) {
      logger.error('Error deleting form', { error, formId });
      throw error;
    }
  }

  /**
   * Upsert a form with version and conflict resolution
   */
  static async upsertForm(data: FormData, version: number): Promise<FormData> {
    const formData = this.prepareFormData(data, version);

    try {
      const result = await db
        .insert(forms)
        .values(formData)
        .onConflictDoUpdate({
          target: forms.id,
          set: formData,
        })
        .returning();

      return result[0] as FormData;
    } catch (error) {
      logger.error('Error upserting form', { error, data });
      throw error;
    }
  }

  /**
   * Get current version of a form
   */
  static async getFormVersion(formId: string): Promise<number | null> {
    try {
      const data = await db
        .select({ version: forms.version })
        .from(forms)
        .where(eq(forms.id, formId))
        .limit(1);

      return data?.[0]?.version || null;
    } catch (error) {
      logger.error('Error fetching form version', { error, formId });
      throw error;
    }
  }

  /**
   * Get updatedAt timestamp for conflict resolution
   */
  static async getFormUpdatedAt(formId: string): Promise<Date | null> {
    try {
      const data = await db
        .select({ updatedAt: forms.updatedAt })
        .from(forms)
        .where(eq(forms.id, formId))
        .limit(1);

      return data?.[0]?.updatedAt || null;
    } catch (error) {
      logger.error('Error fetching form updatedAt', { error, formId });
      throw error;
    }
  }

  /**
   * Prepare form data
   */
  private static prepareFormData(data: FormData, version: number): FormData {
    const isCreate = !data.id;
    const now = new Date();

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
