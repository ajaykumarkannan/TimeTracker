import { describe, test, expect } from 'vitest';
import {
  isValidISODate,
  isValidDateOnly,
  validateDateParam,
  validatePositiveInt,
  validateCategoryId,
  validateDescription,
  validateTimeRange
} from '../validation';

describe('Validation Utilities', () => {
  describe('isValidISODate', () => {
    test('validates correct ISO 8601 format', () => {
      expect(isValidISODate('2024-01-15T10:30:00.000Z')).toBe(true);
      expect(isValidISODate('2024-01-15T00:00:00Z')).toBe(true);
      expect(isValidISODate('2024-12-31T23:59:59.999Z')).toBe(true);
      expect(isValidISODate('2024-01-15')).toBe(true); // date only accepted
    });

    test('rejects invalid ISO formats', () => {
      expect(isValidISODate('not-a-date')).toBe(false);
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate(null as unknown as string)).toBe(false);
      expect(isValidISODate(undefined as unknown as string)).toBe(false);
    });
  });

  describe('isValidDateOnly', () => {
    test('validates correct YYYY-MM-DD format', () => {
      expect(isValidDateOnly('2024-01-15')).toBe(true);
      expect(isValidDateOnly('2024-12-31')).toBe(true);
      expect(isValidDateOnly('2020-02-29')).toBe(true); // leap year
    });

    test('rejects invalid date formats', () => {
      expect(isValidDateOnly('2024/01/15')).toBe(false);
      expect(isValidDateOnly('01-15-2024')).toBe(false);
      expect(isValidDateOnly('2024-1-15')).toBe(false);
      expect(isValidDateOnly('not-a-date')).toBe(false);
      expect(isValidDateOnly('')).toBe(false);
      expect(isValidDateOnly('2024-01-15T10:00:00Z')).toBe(false); // full ISO not accepted
    });

    test('rejects invalid dates', () => {
      expect(isValidDateOnly('2024-13-01')).toBe(false);
      expect(isValidDateOnly('2024-00-01')).toBe(false);
    });
  });

  describe('validateDateParam', () => {
    test('returns null for empty/undefined values', () => {
      expect(validateDateParam(undefined, 'startDate')).toBeNull();
      expect(validateDateParam(null, 'startDate')).toBeNull();
      expect(validateDateParam('', 'startDate')).toBeNull();
    });

    test('returns valid date string', () => {
      expect(validateDateParam('2024-01-15T10:30:00Z', 'date')).toBe('2024-01-15T10:30:00Z');
    });

    test('throws for invalid date string', () => {
      expect(() => validateDateParam('invalid', 'startDate')).toThrow('must be a valid ISO 8601 date');
    });

    test('throws for non-string values', () => {
      expect(() => validateDateParam(123, 'startDate')).toThrow('must be a string');
    });
  });

  describe('validatePositiveInt', () => {
    test('returns default for empty values', () => {
      expect(validatePositiveInt(undefined, 'limit', 10)).toBe(10);
      expect(validatePositiveInt(null, 'limit', 20)).toBe(20);
      expect(validatePositiveInt('', 'limit', 30)).toBe(30);
    });

    test('parses valid integers', () => {
      expect(validatePositiveInt(5, 'limit', 10)).toBe(5);
      expect(validatePositiveInt('15', 'limit', 10)).toBe(15);
      expect(validatePositiveInt(0, 'limit', 10)).toBe(0); // 0 is valid positive int (>= 0)
    });

    test('throws for negative values', () => {
      expect(() => validatePositiveInt(-1, 'limit', 10)).toThrow('must be a positive integer');
    });

    test('throws for non-numeric values', () => {
      expect(() => validatePositiveInt('abc', 'limit', 10)).toThrow('must be a positive integer');
    });
  });

  describe('validateCategoryId', () => {
    test('parses valid category ID', () => {
      expect(validateCategoryId(1)).toBe(1);
      expect(validateCategoryId('5')).toBe(5);
      expect(validateCategoryId(100)).toBe(100);
    });

    test('throws for missing value', () => {
      expect(() => validateCategoryId(undefined)).toThrow('is required');
      expect(() => validateCategoryId(null)).toThrow('is required');
    });

    test('throws for invalid values', () => {
      expect(() => validateCategoryId(0)).toThrow('must be a positive integer');
      expect(() => validateCategoryId(-1)).toThrow('must be a positive integer');
      expect(() => validateCategoryId('abc')).toThrow('must be a positive integer');
    });
  });

  describe('validateDescription', () => {
    test('returns null for empty values', () => {
      expect(validateDescription(undefined)).toBeNull();
      expect(validateDescription(null)).toBeNull();
      expect(validateDescription('')).toBeNull();
    });

    test('returns trimmed string', () => {
      expect(validateDescription('Meeting notes')).toBe('Meeting notes');
      expect(validateDescription('  trimmed  ')).toBe('trimmed');
    });

    test('accepts descriptions up to 500 chars', () => {
      const longDesc = 'a'.repeat(500);
      expect(validateDescription(longDesc)).toBe(longDesc);
    });

    test('throws for too long descriptions', () => {
      const tooLong = 'a'.repeat(501);
      expect(() => validateDescription(tooLong)).toThrow('must be 500 characters or less');
    });

    test('throws for non-string values', () => {
      expect(() => validateDescription(123)).toThrow('must be a string');
    });
  });

  describe('validateTimeRange', () => {
    test('passes for valid time range', () => {
      expect(() => validateTimeRange('2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z')).not.toThrow();
    });

    test('throws when end is before start', () => {
      expect(() => validateTimeRange('2024-01-15T12:00:00Z', '2024-01-15T10:00:00Z')).toThrow('must be after');
    });

    test('throws when end equals start', () => {
      expect(() => validateTimeRange('2024-01-15T10:00:00Z', '2024-01-15T10:00:00Z')).toThrow('must be after');
    });
  });
});
