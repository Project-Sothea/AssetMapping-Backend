import { PinData, FormData, PinDataSchema, FormDataSchema } from '../types';
import { logger } from '../utils/logger';

export class ValidationService {
  /**
   * Validate pin data
   */
  validatePin(data: unknown): PinData {
    try {
      return PinDataSchema.parse(data);
    } catch (error) {
      logger.warn('Pin validation failed', { data, error });
      throw error;
    }
  }

  /**
   * Validate form data
   */
  validateForm(data: unknown): FormData {
    try {
      return FormDataSchema.parse(data);
    } catch (error) {
      logger.warn('Form validation failed', { data, error });
      throw error;
    }
  }

  /**
   * Validate coordinates are within bounds
   */
  validateCoordinates(latitude: number, longitude: number): boolean {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  /**
   * Sanitize form data - remove any potentially harmful content
   */
  sanitizeFormData(data: FormData): FormData {
    // Basic sanitization - can be extended
    return {
      ...data,
      data: this.sanitizeObject(data.data),
    };
  }

  /**
   * Recursively sanitize object values
   */
  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Basic XSS prevention - remove script tags
        sanitized[key] = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeObject(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const validationService = new ValidationService();
