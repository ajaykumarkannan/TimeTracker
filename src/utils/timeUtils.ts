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
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
 * Convert datetime string to local datetime-local format
 */
export function formatDateTimeLocal(dateStr: string): string {
  const date = new Date(dateStr);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert datetime string to local date format (YYYY-MM-DD)
 */
export function formatDateOnly(dateStr: string): string {
  const date = new Date(dateStr);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Convert datetime string to local time format (HH:MM)
 */
export function formatTimeOnly(dateStr: string): string {
  const date = new Date(dateStr);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(11, 16);
}

/**
 * Combine date and time strings into a Date object
 */
export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}
