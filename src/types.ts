export interface User {
  id: number;
  email: string;
  username: string;
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

export type Period = 'week' | 'month' | 'quarter';

export type Theme = 'light' | 'dark' | 'system';
