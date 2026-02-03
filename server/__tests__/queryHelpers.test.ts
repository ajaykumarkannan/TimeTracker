import { describe, it, expect } from 'vitest';
import { 
  rowToTimeEntry, 
  rowsToTimeEntries, 
  buildTimeEntriesQuery,
  buildDateRangeWhere,
  calculateDurationMinutes,
  TIME_ENTRIES_WITH_CATEGORIES_QUERY
} from '../utils/queryHelpers';

describe('Query Helpers', () => {
  describe('rowToTimeEntry', () => {
    it('converts database row to TimeEntry object', () => {
      const row = [
        1,                          // id
        100,                        // user_id
        5,                          // category_id
        'Development',              // category_name
        '#007bff',                  // category_color
        'Working on feature',       // task_name
        '2024-01-15T09:00:00Z',     // start_time
        '2024-01-15T11:00:00Z',     // end_time
        120,                        // duration_minutes
        '2024-01-15T09:00:00Z'      // created_at
      ];

      const entry = rowToTimeEntry(row);

      expect(entry).toEqual({
        id: 1,
        user_id: 100,
        category_id: 5,
        category_name: 'Development',
        category_color: '#007bff',
        task_name: 'Working on feature',
        start_time: '2024-01-15T09:00:00Z',
        end_time: '2024-01-15T11:00:00Z',
        duration_minutes: 120,
        created_at: '2024-01-15T09:00:00Z'
      });
    });

    it('handles null values correctly', () => {
      const row = [
        1, 100, 5, 'Development', null, null, 
        '2024-01-15T09:00:00Z', null, null, '2024-01-15T09:00:00Z'
      ];

      const entry = rowToTimeEntry(row);

      expect(entry.category_color).toBeNull();
      expect(entry.task_name).toBeNull();
      expect(entry.end_time).toBeNull();
      expect(entry.duration_minutes).toBeNull();
    });
  });

  describe('rowsToTimeEntries', () => {
    it('converts multiple rows to TimeEntry array', () => {
      const result = [{
        values: [
          [1, 100, 5, 'Dev', '#007bff', 'Task 1', '2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z', 60, '2024-01-15T09:00:00Z'],
          [2, 100, 5, 'Dev', '#007bff', 'Task 2', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 60, '2024-01-15T10:00:00Z']
        ]
      }];

      const entries = rowsToTimeEntries(result);

      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe(1);
      expect(entries[1].id).toBe(2);
    });

    it('returns empty array for empty result', () => {
      expect(rowsToTimeEntries([])).toEqual([]);
      expect(rowsToTimeEntries([{ values: [] }])).toEqual([]);
    });
  });

  describe('buildTimeEntriesQuery', () => {
    it('returns base query without parameters', () => {
      const query = buildTimeEntriesQuery();
      expect(query).toBe(TIME_ENTRIES_WITH_CATEGORIES_QUERY);
    });

    it('adds WHERE clause', () => {
      const query = buildTimeEntriesQuery('te.user_id = ?');
      expect(query).toContain('WHERE te.user_id = ?');
    });

    it('adds ORDER BY clause', () => {
      const query = buildTimeEntriesQuery(undefined, 'te.start_time DESC');
      expect(query).toContain('ORDER BY te.start_time DESC');
    });

    it('adds LIMIT and OFFSET', () => {
      const query = buildTimeEntriesQuery(undefined, undefined, 10, 20);
      expect(query).toContain('LIMIT 10');
      expect(query).toContain('OFFSET 20');
    });

    it('combines all clauses', () => {
      const query = buildTimeEntriesQuery('te.user_id = ?', 'te.start_time DESC', 10, 0);
      expect(query).toContain('WHERE te.user_id = ?');
      expect(query).toContain('ORDER BY te.start_time DESC');
      expect(query).toContain('LIMIT 10');
      expect(query).toContain('OFFSET 0');
    });
  });

  describe('buildDateRangeWhere', () => {
    it('builds clause with user_id only', () => {
      const { clause, params } = buildDateRangeWhere(100);
      expect(clause).toBe('te.user_id = ?');
      expect(params).toEqual([100]);
    });

    it('adds start date filter', () => {
      const { clause, params } = buildDateRangeWhere(100, '2024-01-01');
      expect(clause).toContain('te.start_time >= ?');
      expect(params).toContain('2024-01-01');
    });

    it('adds end date filter', () => {
      const { clause, params } = buildDateRangeWhere(100, undefined, '2024-01-31');
      expect(clause).toContain('te.start_time <= ?');
      expect(params).toContain('2024-01-31');
    });

    it('adds both date filters', () => {
      const { clause, params } = buildDateRangeWhere(100, '2024-01-01', '2024-01-31');
      expect(clause).toContain('te.start_time >= ?');
      expect(clause).toContain('te.start_time <= ?');
      expect(params).toEqual([100, '2024-01-01', '2024-01-31']);
    });
  });

  describe('calculateDurationMinutes', () => {
    it('calculates duration correctly', () => {
      const start = '2024-01-15T09:00:00Z';
      const end = '2024-01-15T11:00:00Z';
      expect(calculateDurationMinutes(start, end)).toBe(120);
    });

    it('handles partial minutes', () => {
      const start = '2024-01-15T09:00:00Z';
      const end = '2024-01-15T09:30:30Z'; // 30.5 minutes
      expect(calculateDurationMinutes(start, end)).toBe(31); // Rounded
    });

    it('returns 0 for same time', () => {
      const time = '2024-01-15T09:00:00Z';
      expect(calculateDurationMinutes(time, time)).toBe(0);
    });

    it('returns negative for reversed times', () => {
      const start = '2024-01-15T11:00:00Z';
      const end = '2024-01-15T09:00:00Z';
      expect(calculateDurationMinutes(start, end)).toBe(-120);
    });
  });
});
