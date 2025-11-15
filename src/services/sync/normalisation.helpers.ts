import { z } from 'zod';

/**
 * Extract date field names from a Zod schema by checking for z.date() or transformed date fields
 */
export function getDateFields(schema: z.ZodSchema): string[] {
  const dateFields: string[] = [];
  if (schema && typeof schema === 'object' && 'shape' in schema) {
    const shape = (schema as any).shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      // Check if the field is a z.date() or a transformed date (e.g., string -> Date)
      if (fieldSchema && typeof fieldSchema === 'object') {
        const fieldType = (fieldSchema as any)._def?.typeName;
        if (
          fieldType === 'ZodDate' ||
          (fieldType === 'ZodEffects' &&
            (fieldSchema as any)._def?.schema?._def?.typeName === 'ZodDate')
        ) {
          dateFields.push(key);
        }
      }
    }
  }
  // Fallback: hardcoded common date fields if introspection fails
  if (dateFields.length === 0) {
    dateFields.push('createdAt', 'updatedAt', 'deletedAt', 'lastSyncedAt', 'lastFailedSyncAt');
  }
  return dateFields;
}

/**
 * Normalize payload by converting ISO date strings to Date objects, using schema to identify date fields
 */
export function normalizePayload(
  payload: Record<string, unknown>,
  schema: z.ZodSchema
): Record<string, unknown> {
  const dateFields = getDateFields(schema);
  return convertDateStringsDeep(payload, dateFields);
}

/**
 * Recursively convert ISO date strings to Date objects for specified fields
 */
export function convertDateStringsDeep(input: any, dateFields: string[]): any {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map((item) => convertDateStringsDeep(item, dateFields));
  if (typeof input === 'object') {
    const out: any = {};
    for (const key of Object.keys(input)) {
      const v = input[key];
      if (dateFields.includes(key) && typeof v === 'string') {
        const date = new Date(v);
        out[key] = !isNaN(date.getTime()) ? date : v; // Convert if valid, else keep original
      } else {
        out[key] = convertDateStringsDeep(v, dateFields);
      }
    }
    return out;
  }
  return input;
}
