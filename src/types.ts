export interface User {
  id: number;
  email: string;
  name: string;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Category {
  id: number;
  user_id?: number;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  user_id?: number;
  category_id: number;
  category_name: string;
  category_color: string | null;
  note: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface CategoryTotal {
  name: string;
  color: string;
  minutes: number;
  count: number;
}

export interface DailyTotal {
  date: string;
  minutes: number;
  byCategory: { [key: string]: number };
}

export interface TopNote {
  note: string;
  count: number;
  total_minutes: number;
}

export interface AnalyticsData {
  period: { start: string; end: string };
  summary: {
    totalMinutes: number;
    totalEntries: number;
    avgMinutesPerDay: number;
    previousTotal: number;
    change: number;
  };
  byCategory: CategoryTotal[];
  daily: DailyTotal[];
  topNotes: TopNote[];
}

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'all' | 'last7' | 'last30' | 'last90';

export type Theme = 'light' | 'dark' | 'system';

export interface ExportData {
  exportedAt: string;
  categories: Category[];
  timeEntries: TimeEntry[];
}

export interface ColumnMapping {
  category?: number;
  color?: number;
  note?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface ImportEntry {
  rowIndex: number;
  category: string;
  color: string | null;
  note: string | null;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  isNewCategory?: boolean;
  error: string | null;
  skip?: boolean;
}

export interface CSVPreviewResponse {
  headers?: string[];
  rowCount?: number;
  suggestedMapping?: ColumnMapping;
  preview?: string[][];
  entries?: ImportEntry[];
  newCategories?: string[];
  existingCategories?: string[];
  validCount?: number;
  errorCount?: number;
}

export interface UserSettings {
  timezone: string;
}
