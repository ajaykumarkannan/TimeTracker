/**
 * Helper functions for common database queries
 * Reduces code duplication and improves maintainability
 */

import { TimeEntry } from '../database';

/**
 * Base query for time entries with category information
 * Includes all necessary fields for time entry operations
 */
export const TIME_ENTRIES_WITH_CATEGORIES_QUERY = `
  SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
         te.description, te.start_time, te.end_time, te.duration_minutes, te.created_at
  FROM time_entries te
  JOIN categories c ON te.category_id = c.id
`;

/**
 * Convert database row array to TimeEntry object
 * Ensures consistent mapping across all routes
 */
export function rowToTimeEntry(row: unknown[]): TimeEntry & { category_name: string; category_color: string | null } {
  return {
    id: row[0] as number,
    user_id: row[1] as number,
    category_id: row[2] as number,
    category_name: row[3] as string,
    category_color: row[4] as string | null,
    description: row[5] as string | null,
    start_time: row[6] as string,
    end_time: row[7] as string | null,
    duration_minutes: row[8] as number | null,
    created_at: row[9] as string
  };
}

/**
 * Convert multiple database rows to TimeEntry array
 */
export function rowsToTimeEntries(result: { values: unknown[][] }[]): (TimeEntry & { category_name: string; category_color: string | null })[] {
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  return result[0].values.map(rowToTimeEntry);
}

/**
 * Build a time entries query with optional WHERE clause
 */
export function buildTimeEntriesQuery(whereClause?: string, orderBy?: string, limit?: number, offset?: number): string {
  let query = TIME_ENTRIES_WITH_CATEGORIES_QUERY;
  
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }
  
  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }
  
  if (limit !== undefined) {
    query += ` LIMIT ${limit}`;
    if (offset !== undefined) {
      query += ` OFFSET ${offset}`;
    }
  }
  
  return query;
}

/**
 * Build WHERE clause for user and date range
 */
export function buildDateRangeWhere(userId: number, startDate?: string, endDate?: string): { clause: string; params: (number | string)[] } {
  const params: (number | string)[] = [userId];
  let clause = 'te.user_id = ?';
  
  if (startDate) {
    clause += ' AND te.start_time >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    clause += ' AND te.start_time <= ?';
    params.push(endDate);
  }
  
  return { clause, params };
}

/**
 * Calculate duration in minutes between two ISO timestamps
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  return Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
}
