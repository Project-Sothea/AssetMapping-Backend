import { db } from '../db'; // Import the Drizzle db instance
import { eq, desc, gte } from 'drizzle-orm'; // Import Drizzle query helpers
import { logger } from '../utils/logger';
import {
  forms,
  FormDB,
  FormArrayFieldKeys,
  Form,
  FORM_ARRAY_FIELDS,
} from '@assetmapping/shared-types';

export class FormService {
  static async getAllForms(): Promise<Form[]> {
    logger.info('Fetching all forms');
    try {
      const data = await db
        .select()
        .from(forms)
        .orderBy(desc(forms.createdAt));

      logger.info('Successfully fetched forms', { count: data?.length || 0 });
      return (data || []).map((form) => this.parseFormArrays(form));
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
      return (data || []).map((form) => this.parseFormArrays(form));
    } catch (error) {
      logger.error('Error fetching forms since timestamp', { error, timestamp });
      throw error;
    }
  }

  static async getFormById(id: string): Promise<Form> {
    logger.info('Fetching single form', { formId: id });
    try {
      const data = await db
        .select()
        .from(forms)
        .where(eq(forms.id, id))
        .limit(1);

      if (!data || data.length === 0) {
        logger.warn('Form not found', { formId: id });
        throw new Error('Form not found');
      }

      logger.info('Successfully fetched form', { formId: id });
      return this.parseFormArrays(data[0]);
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

      return this.parseFormArrays(result[0]);
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
  private static prepareFormData(data: Form, version: number): FormDB {
    const isCreate = !data.id;
    const now = new Date();

    return {
      ...data,
      version,
      status: data.status || 'synced',
      updatedAt: now,
      ...(isCreate && { createdAt: now }),
      ...this.stringifyArrayFields(data),
    } as FormDB;
  }

  static parseFormArrays(form: FormDB): Form {
    const parseArrayField = (value: string | string[] | null): string[] | null => {
      if (!value) return null;
      if (Array.isArray(value)) return value.map((v) => String(v));
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : null;
      } catch {
        return null;
      }
    };

    const parsed = { ...form } as Omit<FormDB, FormArrayFieldKeys> &
      Record<FormArrayFieldKeys, string[] | null>;

    FORM_ARRAY_FIELDS.forEach((key) => {
      const value = form[key as keyof FormDB] as unknown as string | null;
      parsed[key] = parseArrayField(value);
    });

    return parsed;
  }

  private static stringifyArrayFields(form: Form): Partial<FormDB> {
    const stringified: Partial<FormDB> = {};
    FORM_ARRAY_FIELDS.forEach((key) => {
      const value = form[key];
      stringified[key] = value ? JSON.stringify(value) : JSON.stringify([]);
    });
    return stringified;
  }
}
