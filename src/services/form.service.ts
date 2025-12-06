import { forms, Form } from '@assetmapping/shared-types';
import { eq, desc, gte } from 'drizzle-orm'; // Import Drizzle query helpers

import { db } from '../db'; // Import the Drizzle db instance
import { mapFormDbToForm, sanitizeFormForDb } from '../db/utils';
import { logger } from '../utils/logger';

export class FormService {
  static async getAllForms(): Promise<Form[]> {
    logger.info('Fetching all forms');
    try {
      const data = await db.select().from(forms).orderBy(desc(forms.createdAt));

      logger.info('Successfully fetched forms', { count: data?.length || 0 });
      return (data || []).map((form) => mapFormDbToForm(form));
    } catch (error) {
      logger.error('Error fetching forms', { error });
      throw error;
    }
  }

  static async getFormsSince(timestamp: number): Promise<Form[]> {
    logger.info('Fetching forms since timestamp', { timestamp });
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    try {
      const data = await db
        .select()
        .from(forms)
        .where(gte(forms.updatedAt, date))
        .orderBy(forms.updatedAt);

      logger.info('Successfully fetched forms since timestamp', {
        timestamp,
        count: data?.length || 0,
      });
      return (data || []).map((form) => mapFormDbToForm(form));
    } catch (error) {
      logger.error('Error fetching forms since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getFormById(id: string): Promise<Form> {
    logger.info('Fetching single form', { formId: id });
    try {
      const data = await db.select().from(forms).where(eq(forms.id, id)).limit(1);

      if (!data || data.length === 0) {
        logger.warn('Form not found', { formId: id });
        throw new Error('Form not found');
      }

      logger.info('Successfully fetched form', { formId: id });
      return mapFormDbToForm(data[0]);
    } catch (error) {
      logger.error('Error fetching form', { error, formId: id });
      throw error;
    }
  }

  /**
   * Hard delete a form
   */
  static async deleteForm(formId: string): Promise<void> {
    try {
      await db.delete(forms).where(eq(forms.id, formId));
    } catch (error) {
      logger.error('Error deleting form', { error, formId });
      throw error;
    }
  }

  /**
   * Upsert a form with version and conflict resolution
   */
  static async upsertForm(data: Form, version: number): Promise<Form> {
    const formData = sanitizeFormForDb(data, version);

    try {
      const result = await db
        .insert(forms)
        .values(formData)
        .onConflictDoUpdate({
          target: forms.id,
          set: formData,
        })
        .returning();

      return mapFormDbToForm(result[0]);
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
}
