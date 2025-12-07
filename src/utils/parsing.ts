/**
 * General Parsing Utilities for Backend
 *
 * Provides consistent parsing and validation functions for common data types
 * used throughout the backend, reducing code duplication.
 */

/**
 * Safely parse JSON string with a fallback value
 * @param jsonString - The JSON string to parse
 * @param fallback - Value to return if parsing fails
 * @returns Parsed value or fallback
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Parse timestamps from query params, supporting both ISO date strings and numeric values.
 * @param value - Query parameter value (string or array of strings)
 * @returns Parsed timestamp in milliseconds since epoch, or NaN if invalid
 */
export function parseTimestampQuery(value?: string | string[]): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) {
    return NaN;
  }
  const parsedFromDate = Date.parse(rawValue);
  if (!Number.isNaN(parsedFromDate)) {
    return parsedFromDate;
  }
  const parsedNumber = Number(rawValue);
  return Number.isFinite(parsedNumber) ? parsedNumber : NaN;
}
