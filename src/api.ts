import { Category, TimeEntry, AnalyticsData, AuthResponse, User, ColumnMapping, ImportEntry, CSVPreviewResponse, UserSettings, CategoryDrilldown, TaskNamesPaginated } from './types';

const API_BASE = '/api';

// Request timeout configuration (30 seconds default)
const DEFAULT_TIMEOUT_MS = 30000;

// Rate limit retry configuration
const MAX_RATE_LIMIT_RETRIES = 2;
const MIN_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

// Proactive refresh threshold - refresh token when less than this time remains (5 minutes)
const PROACTIVE_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// Session management
let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');
let sessionId: string | null = localStorage.getItem('sessionId');
let refreshPromise: Promise<AuthResponse | null> | null = null; // Prevent concurrent refresh attempts

// Auth state change listeners - used to notify when a logged-in user gets logged out unexpectedly
type AuthStateChangeCallback = (reason: 'session_expired' | 'refresh_failed') => void;
const authStateChangeListeners: Set<AuthStateChangeCallback> = new Set();

// API error listeners - used to surface transient errors (rate limiting) to the UI
type ApiErrorCallback = (error: { type: 'rate_limit'; message: string; retryAfterSec: number }) => void;
const apiErrorListeners: Set<ApiErrorCallback> = new Set();

/**
 * Subscribe to API errors (e.g., rate limiting) so the UI can show a notification.
 * Returns an unsubscribe function.
 */
export function onApiError(callback: ApiErrorCallback): () => void {
  apiErrorListeners.add(callback);
  return () => apiErrorListeners.delete(callback);
}

/**
 * Subscribe to authentication state changes (e.g., when a logged-in user is unexpectedly logged out)
 * Returns an unsubscribe function
 */
export function onAuthStateChange(callback: AuthStateChangeCallback): () => void {
  authStateChangeListeners.add(callback);
  return () => authStateChangeListeners.delete(callback);
}

/**
 * Check if the user was previously logged in (had tokens stored)
 */
export function wasLoggedIn(): boolean {
  return localStorage.getItem('user') !== null;
}

function notifyAuthStateChange(reason: 'session_expired' | 'refresh_failed') {
  authStateChangeListeners.forEach(callback => {
    try {
      callback(reason);
    } catch {
      // Ignore callback errors
    }
  });
}

// Generate or get session ID for anonymous users
function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function getStoredUser(): User | null {
  const stored = localStorage.getItem('user');
  return stored ? JSON.parse(stored) : null;
}

export function setStoredUser(user: User) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function isLoggedIn(): boolean {
  return !!accessToken;
}

/**
 * Decode JWT payload without verification (client-side only for expiration check)
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if access token is expired or about to expire
 */
function isTokenExpiringSoon(): boolean {
  if (!accessToken) return false;
  
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.exp) return false;
  
  const expiresAt = payload.exp * 1000; // Convert to milliseconds
  const now = Date.now();
  
  return expiresAt - now < PROACTIVE_REFRESH_THRESHOLD_MS;
}

/**
 * Perform a token refresh, deduplicating concurrent attempts.
 * Both proactive refresh and reactive 401 retry share this function
 * so that only one refresh request is in-flight at a time.
 * Returns the new AuthResponse on success, or null on failure.
 */
async function performTokenRefresh(): Promise<AuthResponse | null> {
  if (!refreshToken) return null;

  // Prevent concurrent refresh attempts -- reuse in-flight request
  if (refreshPromise) {
    return refreshPromise as Promise<AuthResponse | null>;
  }

  refreshPromise = (async () => {
    try {
      const refreshRes = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (refreshRes.ok) {
        const data: AuthResponse = await refreshRes.json();
        setTokens(data.accessToken, data.refreshToken);
        setStoredUser(data.user);
        return data;
      } else {
        return null;
      }
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise as Promise<AuthResponse | null>;
}

/**
 * Proactively refresh the access token if it's about to expire
 * Returns true if refresh was successful or not needed, false if refresh failed
 */
async function proactiveRefresh(): Promise<boolean> {
  if (!refreshToken || !isTokenExpiringSoon()) {
    return true; // No refresh needed
  }
  
  const result = await performTokenRefresh();
  return result !== null;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal 
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function apiFetch(url: string, options: RequestInit = {}, { skipProactiveRefresh = false } = {}): Promise<Response> {
  // Proactively refresh token if it's about to expire (prevents failed requests).
  // Mutations can opt out via skipProactiveRefresh so the request isn't blocked by
  // a slow refresh round-trip (e.g. after wake from sleep). The 401 retry path below
  // handles expired tokens as a fallback.
  if (!skipProactiveRefresh && accessToken && refreshToken) {
    await proactiveRefresh();
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  // Add auth header if logged in, otherwise add session ID
  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  } else {
    (headers as Record<string, string>)['X-Session-ID'] = getSessionId();
  }

  let res = await fetchWithTimeout(url, { ...options, headers });

  // Handle rate limiting with automatic retry
  // Instead of immediately failing, wait for the rate limit window to reset and retry.
  // This makes transient rate limits invisible to the user during normal editing.
  if (res.status === 429) {
    for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      const retryAfter = parseInt(res.headers.get('X-RateLimit-Reset') || '0', 10);
      const waitMs = retryAfter
        ? Math.min(MAX_RETRY_DELAY_MS, Math.max(MIN_RETRY_DELAY_MS, (retryAfter - Math.floor(Date.now() / 1000)) * 1000))
        : MIN_RETRY_DELAY_MS * (attempt + 1);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      res = await fetchWithTimeout(url, { ...options, headers });
      if (res.status !== 429) break;
    }
    // If still rate-limited after retries, notify UI and throw
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('X-RateLimit-Reset') || '0', 10);
      const waitSec = retryAfter ? Math.max(1, retryAfter - Math.floor(Date.now() / 1000)) : 60;
      const message = `Too many requests — please wait ${waitSec}s and try again.`;
      apiErrorListeners.forEach(cb => {
        try { cb({ type: 'rate_limit', message, retryAfterSec: waitSec }); } catch { /* ignore */ }
      });
      const err = new Error(message);
      err.name = 'RateLimitError';
      throw err;
    }
  }

  // If unauthorized and we have a refresh token, try to refresh
  // Uses the shared performTokenRefresh() to deduplicate concurrent 401 retries
  if (res.status === 401 && refreshToken) {
    const data = await performTokenRefresh();

    if (data) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${data.accessToken}`;
      delete (headers as Record<string, string>)['X-Session-ID'];
      res = await fetchWithTimeout(url, { ...options, headers });
    } else {
      // User was logged in but refresh failed - notify listeners
      // This prevents falling back to guest mode silently
      clearTokens();
      notifyAuthStateChange('refresh_failed');
    }
  }

  return res;
}

/** Fetch via apiFetch, throw on error, return parsed JSON */
async function apiGet<T>(url: string, errorMsg: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(errorMsg);
  return res.json();
}

/** Fetch via apiFetch with method/body, throw on error (with server error message if available), return parsed JSON.
 *  Skips proactive token refresh so mutations aren't blocked by a slow refresh round-trip
 *  (e.g. after waking from sleep). The 401 retry in apiFetch handles expired tokens. */
async function apiMutate<T>(url: string, method: string, body?: unknown, errorMsg = 'Request failed'): Promise<T> {
  const res = await apiFetch(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }, { skipProactiveRefresh: true });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: errorMsg }));
    throw new Error(error.error || errorMsg);
  }
  return res.json();
}

/** Like apiMutate but returns void (for DELETE operations that return no body) */
async function apiVoid(url: string, method: string, body?: unknown, errorMsg = 'Request failed'): Promise<void> {
  const res = await apiFetch(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }, { skipProactiveRefresh: true });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: errorMsg }));
    throw new Error(error.error || errorMsg);
  }
}

export const api = {
  // Auth - these have side effects (token management) so they use raw fetch
  async register(email: string, name: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Registration failed');
    }
    const data: AuthResponse = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  async login(email: string, password: string, rememberMe?: boolean): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, rememberMe })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }
    const data: AuthResponse = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    return data;
  },

  async logout(): Promise<void> {
    if (accessToken) {
      try {
        await apiFetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          body: JSON.stringify({ refreshToken })
        });
      } catch {
        // Ignore logout errors
      }
    }
    clearTokens();
  },

  getMe: () => apiGet<User>(`${API_BASE}/auth/me`, 'Failed to get user'),

  // Categories
  getCategories: () => apiGet<Category[]>(`${API_BASE}/categories`, 'Failed to fetch categories'),
  createCategory: (name: string, color?: string) => apiMutate<Category>(`${API_BASE}/categories`, 'POST', { name, color }, 'Failed to create category'),
  updateCategory: (id: number, name: string, color?: string) => apiMutate<Category>(`${API_BASE}/categories/${id}`, 'PUT', { name, color }, 'Failed to update category'),
  deleteCategory: (id: number, replacementCategoryId?: number) => apiVoid(`${API_BASE}/categories/${id}`, 'DELETE', { replacementCategoryId }, 'Failed to delete category'),

  // Time entries
  async getTimeEntries(startDate?: string, endDate?: string, categoryId?: number, search?: string): Promise<TimeEntry[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (categoryId) params.append('categoryId', categoryId.toString());
    if (search) params.append('search', search);
    const qs = params.toString();
    return apiGet<TimeEntry[]>(qs ? `${API_BASE}/time-entries?${qs}` : `${API_BASE}/time-entries`, 'Failed to fetch time entries');
  },

  getRecentEntries: (limit = 20) => apiGet<TimeEntry[]>(`${API_BASE}/time-entries?limit=${limit}`, 'Failed to fetch recent entries'),

  async getTaskNameSuggestions(categoryId?: number, query?: string) {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId.toString());
    if (query) params.set('q', query);
    params.set('limit', '50');
    return apiGet<{ task_name: string; categoryId: number; count: number; totalMinutes: number; lastUsed: string }[]>(`${API_BASE}/time-entries/suggestions?${params}`, 'Failed to fetch suggestions');
  },

  mergeTaskNames: (sourceTaskNames: string[], targetTaskName: string, targetCategoryName?: string) =>
    apiMutate<{ merged: number; entriesUpdated: number; targetTaskName: string }>(`${API_BASE}/time-entries/merge-task-names`, 'POST', { sourceTaskNames, targetTaskName, targetCategoryName }, 'Failed to merge task names'),

  updateTaskNameBulk: (oldTaskName: string, oldCategoryName: string, newTaskName?: string, newCategoryName?: string) =>
    apiMutate<{ entriesUpdated: number }>(`${API_BASE}/time-entries/update-task-name-bulk`, 'POST', { oldTaskName, oldCategoryName, newTaskName, newCategoryName }, 'Failed to update task names'),

  getActiveEntry: () => apiGet<TimeEntry | null>(`${API_BASE}/time-entries/active`, 'Failed to fetch active entry'),
  startEntry: (category_id: number, task_name?: string) => apiMutate<TimeEntry>(`${API_BASE}/time-entries/start`, 'POST', { category_id, task_name }, 'Failed to start entry'),
  stopEntry: (id: number) => apiMutate<TimeEntry>(`${API_BASE}/time-entries/${id}/stop`, 'POST', undefined, 'Failed to stop entry'),
  scheduleStop: (id: number, scheduledEndTime: string) => apiMutate<TimeEntry>(`${API_BASE}/time-entries/${id}/schedule-stop`, 'POST', { scheduled_end_time: scheduledEndTime }, 'Failed to schedule stop'),
  clearScheduledStop: (id: number) => apiMutate<TimeEntry>(`${API_BASE}/time-entries/${id}/schedule-stop`, 'DELETE', undefined, 'Failed to clear scheduled stop'),
  updateEntry: (id: number, data: Partial<TimeEntry>) => apiMutate<TimeEntry>(`${API_BASE}/time-entries/${id}`, 'PUT', data, 'Failed to update entry'),
  deleteEntry: (id: number) => apiVoid(`${API_BASE}/time-entries/${id}`, 'DELETE', undefined, 'Failed to delete entry'),
  batchDeleteEntries: (ids: number[]) => apiMutate<{ deleted: number }>(`${API_BASE}/time-entries/batch-delete`, 'POST', { ids }, 'Failed to batch delete entries'),
  batchMergeEntries: (groups: { keepId: number; deleteIds: number[]; update: Partial<TimeEntry> }[]) =>
    apiMutate<{ updated: number; deleted: number }>(`${API_BASE}/time-entries/batch-merge`, 'POST', { groups }, 'Failed to batch merge entries'),
  deleteEntriesByDate: (date: string) => apiMutate<{ deleted: number }>(`${API_BASE}/time-entries/by-date/${date}`, 'DELETE', undefined, 'Failed to delete entries'),
  createManualEntry: (category_id: number, start_time: string, end_time: string, task_name?: string) =>
    apiMutate<TimeEntry>(`${API_BASE}/time-entries`, 'POST', { category_id, start_time, end_time, task_name }, 'Failed to create entry'),

  // Analytics
  async getAnalytics(start: string, end: string): Promise<AnalyticsData> {
    const timezoneOffset = new Date().getTimezoneOffset();
    return apiGet<AnalyticsData>(`${API_BASE}/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timezoneOffset=${timezoneOffset}`, 'Failed to fetch analytics');
  },

  getCategoryDrilldown(categoryName: string, start: string, end: string, page = 1, pageSize = 20) {
    const params = new URLSearchParams({ start, end, page: page.toString(), pageSize: pageSize.toString() });
    return apiGet<CategoryDrilldown>(`${API_BASE}/analytics/category/${encodeURIComponent(categoryName)}?${params}`, 'Failed to fetch category drilldown');
  },

  getTaskNames(start: string, end: string, page = 1, pageSize = 20, sortBy: 'time' | 'alpha' | 'count' | 'recent' = 'time', search?: string, category?: string) {
    const params = new URLSearchParams({ start, end, page: page.toString(), pageSize: pageSize.toString(), sortBy });
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    return apiGet<TaskNamesPaginated>(`${API_BASE}/analytics/task-names?${params}`, 'Failed to fetch task names');
  },

  updateTaskName: (oldTaskName: string, newTaskName?: string, newCategoryId?: number) =>
    apiMutate<{ success: boolean; updatedCount: number; oldTaskName: string; newTaskName: string; newCategoryId?: number }>(`${API_BASE}/analytics/task-names`, 'PUT', { oldTaskName, newTaskName, newCategoryId }, 'Failed to update task name'),

  // Export
  async exportCSV(): Promise<string> {
    const res = await apiFetch(`${API_BASE}/export/csv`);
    if (!res.ok) throw new Error('Failed to export CSV');
    return res.text();
  },

  importCSV: (csv: string, columnMapping?: ColumnMapping, entries?: ImportEntry[]) =>
    apiMutate<{ imported: number; skipped: number; errors: string[] }>(`${API_BASE}/export/csv`, 'POST', { csv, columnMapping, entries }, 'Failed to import CSV'),

  previewCSV: (csv: string, columnMapping?: ColumnMapping, timeOffsetMinutes?: number) =>
    apiMutate<CSVPreviewResponse>(`${API_BASE}/export/csv/preview`, 'POST', { csv, columnMapping, timeOffsetMinutes }, 'Failed to preview CSV'),

  // Settings
  getSettings: () => apiGet<UserSettings>(`${API_BASE}/settings`, 'Failed to fetch settings'),
  updateSettings: (settings: Partial<UserSettings>) => apiMutate<UserSettings>(`${API_BASE}/settings`, 'PUT', settings, 'Failed to update settings'),

  async convertGuestToAccount(email: string, name: string, password: string): Promise<AuthResponse> {
    const currentSessionId = getSessionId();
    const res = await fetch(`${API_BASE}/auth/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': currentSessionId
      },
      body: JSON.stringify({ email, name, password })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Conversion failed');
    }
    const data: AuthResponse = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    setStoredUser(data.user);
    sessionId = null;
    localStorage.removeItem('sessionId');
    return data;
  },

  resetAllData: () => apiVoid(`${API_BASE}/settings/reset`, 'POST', undefined, 'Failed to reset data'),

  async updateAccount(data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }): Promise<User> {
    const user = await apiMutate<User>(`${API_BASE}/auth/update`, 'PUT', data, 'Update failed');
    setStoredUser(user);
    return user;
  },

  async deleteAccount(): Promise<void> {
    await apiVoid(`${API_BASE}/auth/delete`, 'DELETE', undefined, 'Failed to delete account');
    clearTokens();
  },

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to request password reset');
    }
    return res.json();
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to reset password');
    }
  }
};
