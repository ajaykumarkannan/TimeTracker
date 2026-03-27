import { describe, it, expect } from 'vitest';
import {
  rowToTimeEntry,
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
        null,                       // scheduled_end_time
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
        scheduled_end_time: null,
        duration_minutes: 120,
        created_at: '2024-01-15T09:00:00Z'
      });
    });

    it('handles null values correctly', () => {
      const row = [
        1, 100, 5, 'Development', null, null, 
        '2024-01-15T09:00:00Z', null, null, null, '2024-01-15T09:00:00Z'
      ];

      const entry = rowToTimeEntry(row);

      expect(entry.category_color).toBeNull();
      expect(entry.task_name).toBeNull();
      expect(entry.end_time).toBeNull();
      expect(entry.scheduled_end_time).toBeNull();
      expect(entry.duration_minutes).toBeNull();
    });
  });

  describe('TIME_ENTRIES_WITH_CATEGORIES_QUERY', () => {
    it('contains expected SQL structure', () => {
      expect(TIME_ENTRIES_WITH_CATEGORIES_QUERY).toContain('SELECT');
      expect(TIME_ENTRIES_WITH_CATEGORIES_QUERY).toContain('FROM time_entries');
      expect(TIME_ENTRIES_WITH_CATEGORIES_QUERY).toContain('JOIN categories');
    });
  });


});
