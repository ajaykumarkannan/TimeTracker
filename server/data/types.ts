export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface RefreshToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  user_id: number;
  category_id: number;
  task_name: string | null;
  start_time: string;
  end_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface UserSettings {
  id: number;
  user_id: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryWithCategory extends TimeEntry {
  category_name: string;
  category_color: string | null;
}

export interface TaskSuggestion {
  task_name: string;
  categoryId: number;
  count: number;
  totalMinutes: number;
  lastUsed: string;
}

export interface TaskNameStats {
  task_name: string;
  count: number;
  total_minutes: number;
  last_used?: string;
  category_name?: string;
  category_color?: string | null;
}

export interface CategorySummary {
  name: string;
  color: string;
  minutes: number;
  count: number;
}

export interface DailySummary {
  date: string;
  minutes: number;
  byCategory: Record<string, number>;
}
