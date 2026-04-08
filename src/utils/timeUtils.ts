import { TimeEntry } from '../types';

/**
 * Optimized overlap detection using interval tree concept
 * Converts O(n²) nested loop to O(n log n) with sorting
 */
export function detectOverlaps(entries: TimeEntry[]): Map<number, TimeEntry> {
  const overlaps = new Map<number, TimeEntry>();

  // Only process completed entries (filter ensures end_time exists)
  const completed = entries.filter((e): e is TimeEntry & { end_time: string } => e.end_time !== null);
  if (completed.length < 2) return overlaps;

  // Sort by start time for efficient overlap detection
  const sorted = [...completed].sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Check each entry against subsequent entries (only need to check forward)
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentStart = new Date(current.start_time).getTime();
    const currentEnd = new Date(current.end_time).getTime();

    // Only check entries that could possibly overlap
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const nextStart = new Date(next.start_time).getTime();

      // If next entry starts after current ends, no more overlaps possible
      if (nextStart >= currentEnd) break;

      const nextEnd = new Date(next.end_time).getTime();

      // Check if ranges overlap
      if (currentStart < nextEnd && currentEnd > nextStart) {
        overlaps.set(current.id, next);
        overlaps.set(next.id, current);
      }
    }
  }

  return overlaps;
}

/**
 * Format time for display
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format time for mobile display (compact: 4:18p instead of 4:18 PM)
 */
export function formatTimeCompact(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const hour12 = (hours % 12 || 12).toString().padStart(2, '0');
  const ampm = hours < 12 ? 'a' : 'p';
  return `${hour12}:${minutes}${ampm}`;
}

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  // Under 10 hours: exact hours and minutes
  if (h < 10) {
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  // 24+ hours: days and hours
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const remH = h % 24;
    if (remH === 0) return `${d}d`;
    return `${d}d ${remH}h`;
  }
  // 10-23 hours: decimal hours (e.g. 10.5h)
  const decimal = minutes / 60;
  const rounded = Math.round(decimal * 10) / 10;
  if (rounded === Math.floor(rounded)) return `${Math.floor(rounded)}h`;
  return `${rounded}h`;
}

/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Convert a date string to a local Date adjusted for timezone offset.
 */
function toLocalDate(dateStr: string): Date {
  const date = new Date(dateStr);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
}

/**
 * Convert datetime string to local datetime-local format
 */
export function formatDateTimeLocal(dateStr: string): string {
  return toLocalDate(dateStr).toISOString().slice(0, 16);
}

/**
 * Convert datetime string to local date format (YYYY-MM-DD)
 */
export function formatDateOnly(dateStr: string): string {
  return toLocalDate(dateStr).toISOString().slice(0, 10);
}

/**
 * Convert datetime string to local time format (HH:MM)
 */
export function formatTimeOnly(dateStr: string): string {
  return toLocalDate(dateStr).toISOString().slice(11, 16);
}

/**
 * Combine date and time strings into a Date object
 */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

/**
 * Adjust date when time crosses the midnight boundary.
 * Detects when the user scrolls/changes time across midnight:
 *   e.g. 11:55 PM (23:55) -> 12:05 AM (00:05) means next day
 *   e.g. 12:05 AM (00:05) -> 11:55 PM (23:55) means previous day
 * Uses local date arithmetic to avoid UTC conversion bugs across timezones.
 */
export function adjustDateForMidnightCrossing(oldTime: string, newTime: string, currentDate: string): string {
  if (!oldTime || !newTime || !currentDate) return currentDate;
  const oldHour = parseInt(oldTime.split(':')[0], 10);
  const newHour = parseInt(newTime.split(':')[0], 10);
  const hourDiff = newHour - oldHour;
  const [year, month, day] = currentDate.split('-').map(Number);
  // Large backward jump (e.g. 23->0, 22->1) means crossed midnight forward
  if (hourDiff < -12) {
    const d = new Date(year, month - 1, day + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // Large forward jump (e.g. 0->23, 1->22) means crossed midnight backward
  if (hourDiff > 12) {
    const d = new Date(year, month - 1, day - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return currentDate;
}
