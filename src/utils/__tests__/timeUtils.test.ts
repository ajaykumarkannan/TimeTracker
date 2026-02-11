import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectOverlaps,
  formatTime,
  formatDuration,
  formatDate,
  formatDateTimeLocal,
  formatDateOnly,
  formatTimeOnly,
  combineDateAndTime
} from '../timeUtils';
import { TimeEntry } from '../../types';

describe('timeUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('detectOverlaps', () => {
    it('returns empty map when fewer than two completed entries', () => {
      const entries: TimeEntry[] = [
        {
          id: 1,
          user_id: 1,
          category_id: 1,
          category_name: 'Deep Work',
          category_color: '#10b981',
          task_name: 'Focus',
          start_time: '2026-02-10T10:00:00.000Z',
          end_time: null,
          scheduled_end_time: null,
          duration_minutes: null,
          created_at: '2026-02-10T10:00:00.000Z'
        }
      ];

      const overlaps = detectOverlaps(entries);
      expect(overlaps.size).toBe(0);
    });

    it('detects overlapping completed entries', () => {
      const entries: TimeEntry[] = [
        {
          id: 1,
          user_id: 1,
          category_id: 1,
          category_name: 'Deep Work',
          category_color: '#10b981',
          task_name: 'Focus',
          start_time: '2026-02-10T10:00:00.000Z',
          end_time: '2026-02-10T11:00:00.000Z',
          scheduled_end_time: null,
          duration_minutes: 60,
          created_at: '2026-02-10T10:00:00.000Z'
        },
        {
          id: 2,
          user_id: 1,
          category_id: 2,
          category_name: 'Meetings',
          category_color: '#6366f1',
          task_name: 'Sync',
          start_time: '2026-02-10T10:30:00.000Z',
          end_time: '2026-02-10T11:15:00.000Z',
          scheduled_end_time: null,
          duration_minutes: 45,
          created_at: '2026-02-10T10:30:00.000Z'
        },
        {
          id: 3,
          user_id: 1,
          category_id: 3,
          category_name: 'Planning',
          category_color: '#8b5cf6',
          task_name: 'Plan',
          start_time: '2026-02-10T12:00:00.000Z',
          end_time: '2026-02-10T12:30:00.000Z',
          scheduled_end_time: null,
          duration_minutes: 30,
          created_at: '2026-02-10T12:00:00.000Z'
        }
      ];

      const overlaps = detectOverlaps(entries);
      expect(overlaps.get(1)?.id).toBe(2);
      expect(overlaps.get(2)?.id).toBe(1);
      expect(overlaps.has(3)).toBe(false);
    });

    it('does not mark touching entries as overlapping', () => {
      const entries: TimeEntry[] = [
        {
          id: 1,
          user_id: 1,
          category_id: 1,
          category_name: 'Deep Work',
          category_color: '#10b981',
          task_name: 'Focus',
          start_time: '2026-02-10T10:00:00.000Z',
          end_time: '2026-02-10T11:00:00.000Z',
          scheduled_end_time: null,
          duration_minutes: 60,
          created_at: '2026-02-10T10:00:00.000Z'
        },
        {
          id: 2,
          user_id: 1,
          category_id: 2,
          category_name: 'Meetings',
          category_color: '#6366f1',
          task_name: 'Sync',
          start_time: '2026-02-10T11:00:00.000Z',
          end_time: '2026-02-10T11:30:00.000Z',
          scheduled_end_time: null,
          duration_minutes: 30,
          created_at: '2026-02-10T11:00:00.000Z'
        }
      ];

      const overlaps = detectOverlaps(entries);
      expect(overlaps.size).toBe(0);
    });
  });

  describe('formatTime', () => {
    it('formats time using locale settings', () => {
      const dateStr = '2026-02-10T09:05:00.000Z';
      const expected = new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      expect(formatTime(dateStr)).toBe(expected);
    });
  });

  describe('formatDuration', () => {
    it('handles null and short durations', () => {
      expect(formatDuration(null)).toBe('—');
      expect(formatDuration(0)).toBe('<1m');
      expect(formatDuration(5)).toBe('5m');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(60)).toBe('1h');
      expect(formatDuration(75)).toBe('1h 15m');
      expect(formatDuration(120)).toBe('2h');
    });
  });

  describe('formatDate', () => {
    it('labels today and yesterday', () => {
      vi.setSystemTime(new Date('2026-02-11T12:00:00.000Z'));
      expect(formatDate('2026-02-11T08:00:00.000Z')).toBe('Today');
      expect(formatDate('2026-02-10T23:00:00.000Z')).toBe('Yesterday');
    });

    it('formats other dates with locale', () => {
      vi.setSystemTime(new Date('2026-02-11T12:00:00.000Z'));
      const dateStr = '2026-02-01T10:00:00.000Z';
      const expected = new Date(dateStr).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      expect(formatDate(dateStr)).toBe(expected);
    });
  });

  describe('formatDateTimeLocal', () => {
    it('returns YYYY-MM-DDTHH:MM in local time', () => {
      const dateStr = '2026-02-11T12:34:56.000Z';
      const date = new Date(dateStr);
      const offset = date.getTimezoneOffset();
      const local = new Date(date.getTime() - offset * 60000);
      const expected = local.toISOString().slice(0, 16);
      expect(formatDateTimeLocal(dateStr)).toBe(expected);
    });
  });

  describe('formatDateOnly', () => {
    it('returns YYYY-MM-DD in local time', () => {
      const dateStr = '2026-02-11T12:34:56.000Z';
      const date = new Date(dateStr);
      const offset = date.getTimezoneOffset();
      const local = new Date(date.getTime() - offset * 60000);
      const expected = local.toISOString().slice(0, 10);
      expect(formatDateOnly(dateStr)).toBe(expected);
    });
  });

  describe('formatTimeOnly', () => {
    it('returns HH:MM in local time', () => {
      const dateStr = '2026-02-11T12:34:56.000Z';
      const date = new Date(dateStr);
      const offset = date.getTimezoneOffset();
      const local = new Date(date.getTime() - offset * 60000);
      const expected = local.toISOString().slice(11, 16);
      expect(formatTimeOnly(dateStr)).toBe(expected);
    });
  });

  describe('combineDateAndTime', () => {
    it('combines date and time strings into a Date', () => {
      const combined = combineDateAndTime('2026-02-11', '09:30');
      expect(combined).toEqual(new Date('2026-02-11T09:30'));
    });
  });
});
