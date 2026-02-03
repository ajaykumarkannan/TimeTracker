/**
 * Input validation utilities for server-side validation
 */

// ISO 8601 date format regex
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

/**
 * Validates if a string is a valid ISO 8601 date format
 */
export function isValidISODate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  if (!ISO_DATE_REGEX.test(dateString)) {
    return false;
  }
  
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Validates if a string is a valid YYYY-MM-DD date format
 */
export function isValidDateOnly(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  
  const date = new Date(dateString + 'T00:00:00Z');
  return !isNaN(date.getTime());
}

/**
 * Validates and parses an optional date parameter
 * Returns the date string if valid, null if not provided, or throws if invalid
 */
export function validateDateParam(value: unknown, paramName: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  
  if (typeof value !== 'string') {
    throw new Error(`${paramName} must be a string`);
  }
  
  if (!isValidISODate(value)) {
    throw new Error(`${paramName} must be a valid ISO 8601 date`);
  }
  
  return value;
}

/**
 * Validates a positive integer parameter
 */
export function validatePositiveInt(value: unknown, paramName: string, defaultValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  
  const parsed = parseInt(String(value), 10);
  
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`${paramName} must be a positive integer`);
  }
  
  return parsed;
}

/**
 * Validates a category ID exists and belongs to a user
 */
export function validateCategoryId(value: unknown, paramName: string = 'category_id'): number {
  if (value === undefined || value === null) {
    throw new Error(`${paramName} is required`);
  }
  
  const id = parseInt(String(value), 10);
  
  if (isNaN(id) || id <= 0) {
    throw new Error(`${paramName} must be a positive integer`);
  }
  
  return id;
}

/**
 * Validates a description string (optional)
 */
export function validateDescription(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  
  if (typeof value !== 'string') {
    throw new Error('description must be a string');
  }
  
  // Limit description length
  if (value.length > 500) {
    throw new Error('description must be 500 characters or less');
  }
  
  return value.trim();
}

/**
 * Validates that end time is after start time
 */
export function validateTimeRange(startTime: string, endTime: string): void {
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  if (end <= start) {
    throw new Error('end_time must be after start_time');
  }
}
