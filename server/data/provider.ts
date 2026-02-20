import type {
  Category,
  CategorySummary,
  DailySummary,
  PasswordResetToken,
  RefreshToken,
  TaskNameStats,
  TaskSuggestion,
  TimeEntry,
  TimeEntryWithCategory,
  User,
  UserSettings
} from './types';

export interface CategoryCreateInput {
  user_id: number;
  name: string;
  color: string | null;
}

export interface TimeEntryCreateInput {
  user_id: number;
  category_id: number;
  task_name: string | null;
  start_time: string;
  end_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number | null;
}

export interface TimeEntryUpdateInput {
  category_id?: number | null;
  task_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  scheduled_end_time?: string | null;
  duration_minutes?: number | null;
}

export interface AnalyticsQueryParams {
  userId: number;
  start: string;
  end: string;
  timezoneOffset: number;
}

export interface TaskNamesQueryParams {
  userId: number;
  start: string;
  end: string;
  page: number;
  pageSize: number;
  sortBy: 'time' | 'alpha' | 'count' | 'recent';
  searchQuery?: string;
  categoryFilter?: string;
}

export interface CategoryDrilldownParams {
  userId: number;
  categoryName: string;
  start: string;
  end: string;
  page: number;
  pageSize: number;
}

export interface TimeEntriesQueryParams {
  userId: number;
  limit: number;
  offset: number;
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: number | null;
  searchQuery?: string;
}

export interface TimeEntryExportRow {
  category_name: string;
  category_color: string | null;
  task_name: string | null;
  start_time: string;
  end_time: string | null;
}

export interface DatabaseProvider {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  getCurrentVersion(): Promise<number>;
  getLatestVersion(): Promise<number>;

  // Users
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: number): Promise<User | null>;
  findUserByEmailExcludingId(email: string, excludeId: number): Promise<User | null>;
  createUser(input: { email: string; username: string; password_hash: string }): Promise<User>;
  updateUser(id: number, input: { email?: string; username?: string; password_hash?: string }): Promise<User>;
  deleteUser(userId: number): Promise<void>;

  // Anonymous sessions
  findAnonymousUserBySession(sessionId: string): Promise<User | null>;
  createAnonymousUser(sessionId: string): Promise<User>;

  // Refresh tokens
  createRefreshToken(input: { user_id: number; token: string; expires_at: string }): Promise<RefreshToken>;
  findRefreshToken(token: string): Promise<RefreshToken | null>;
  deleteRefreshTokenById(id: number): Promise<void>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteRefreshTokensForUser(userId: number): Promise<void>;

  // Password reset
  upsertPasswordResetToken(input: { user_id: number; token: string; expires_at: string }): Promise<PasswordResetToken>;
  findPasswordResetToken(token: string): Promise<PasswordResetToken | null>;
  deletePasswordResetToken(token: string): Promise<void>;
  deletePasswordResetTokensForUser(userId: number): Promise<void>;

  // Categories
  listCategories(userId: number): Promise<Category[]>;
  findCategoryById(userId: number, id: number): Promise<Category | null>;
  findCategoryByName(userId: number, name: string): Promise<Category | null>;
  createCategory(input: CategoryCreateInput): Promise<Category>;
  updateCategory(userId: number, id: number, input: { name: string; color: string | null }): Promise<Category>;
  deleteCategory(userId: number, id: number): Promise<void>;
  countCategories(userId: number): Promise<number>;

  // Time entries
  listTimeEntries(params: TimeEntriesQueryParams): Promise<TimeEntryWithCategory[]>;
  getActiveTimeEntry(userId: number): Promise<TimeEntryWithCategory | null>;
  findTimeEntryById(userId: number, id: number): Promise<TimeEntry | null>;
  findTimeEntryWithCategoryById(userId: number, id: number): Promise<TimeEntryWithCategory | null>;
  findActiveTimeEntry(userId: number): Promise<TimeEntry | null>;
  createTimeEntry(input: TimeEntryCreateInput): Promise<TimeEntry>;
  updateTimeEntry(userId: number, id: number, input: TimeEntryUpdateInput): Promise<void>;
  updateTimeEntriesByTaskName(userId: number, oldTaskName: string, updates: { task_name?: string; category_id?: number }): Promise<number>;
  updateTimeEntriesForMerge(userId: number, sourceTaskNames: string[], updates: { task_name: string; category_id?: number }): Promise<number>;
  updateTimeEntriesForBulkUpdate(userId: number, oldTaskName: string, oldCategoryId: number, updates: { task_name: string; category_id: number }): Promise<number>;
  countTimeEntriesByTaskNames(userId: number, taskNames: string[]): Promise<number>;
  countTimeEntriesByTaskNameAndCategory(userId: number, taskName: string, categoryId: number): Promise<number>;
  deleteTimeEntry(userId: number, id: number): Promise<void>;
  deleteTimeEntriesForUser(userId: number): Promise<number>;
  deleteTimeEntriesByCategory(userId: number, categoryId: number): Promise<number>;
  deleteCategoriesForUser(userId: number): Promise<number>;
  deleteTimeEntriesByDate(userId: number, startOfDay: string, endOfDay: string): Promise<number>;
  reassignTimeEntriesCategory(userId: number, fromCategoryId: number, toCategoryId: number): Promise<number>;
  countTimeEntriesForCategory(userId: number, categoryId: number): Promise<number>;

  // Suggestions & analytics helpers
  listTaskSuggestions(userId: number, categoryId: number | null, query: string, limit: number): Promise<TaskSuggestion[]>;
  listTaskNames(params: TaskNamesQueryParams): Promise<{ taskNames: TaskNameStats[]; totalCount: number }>;
  getCategoryDrilldown(params: CategoryDrilldownParams): Promise<{ category: CategorySummary; taskNames: TaskNameStats[]; totalCount: number }>;
  getAnalyticsSummary(params: AnalyticsQueryParams): Promise<{ byCategory: CategorySummary[]; daily: DailySummary[]; topTasks: TaskNameStats[]; previousTotal: number }>;

  // Export/Import
  listExportRows(userId: number): Promise<TimeEntryExportRow[]>;

  // User settings
  getUserSettings(userId: number): Promise<UserSettings | null>;
  upsertUserSettings(userId: number, timezone: string): Promise<UserSettings>;

  // Maintenance
  createDefaultCategories(userId: number): Promise<void>;

  // Migration helpers (SQLite-only implementations; Mongo returns empty)
  listUsersForMigration(): Promise<User[]>;
  listCategoriesForMigration(userId: number): Promise<Category[]>;
  listTimeEntriesForMigration(userId: number): Promise<TimeEntry[]>;
  getUserSettingsForMigration(userId: number): Promise<UserSettings | null>;
}
