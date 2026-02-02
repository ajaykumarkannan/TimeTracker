import { Category, TimeEntry, AnalyticsData, AuthResponse, User, ColumnMapping, ImportEntry, CSVPreviewResponse, UserSettings } from './types';

const API_BASE = '/api';

// Session management
let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');
let sessionId: string | null = localStorage.getItem('sessionId');

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

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
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

  let res = await fetch(url, { ...options, headers });

  // If unauthorized and we have a refresh token, try to refresh
  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (refreshRes.ok) {
      const data: AuthResponse = await refreshRes.json();
      setTokens(data.accessToken, data.refreshToken);
      setStoredUser(data.user);
      
      (headers as Record<string, string>)['Authorization'] = `Bearer ${data.accessToken}`;
      delete (headers as Record<string, string>)['X-Session-ID'];
      res = await fetch(url, { ...options, headers });
    } else {
      clearTokens();
    }
  }

  return res;
}

export const api = {
  // Auth
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

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
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

  async getMe(): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error('Failed to get user');
    return res.json();
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    const res = await apiFetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },

  async createCategory(name: string, color?: string): Promise<Category> {
    const res = await apiFetch(`${API_BASE}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
    if (!res.ok) throw new Error('Failed to create category');
    return res.json();
  },

  async updateCategory(id: number, name: string, color?: string): Promise<Category> {
    const res = await apiFetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, color })
    });
    if (!res.ok) throw new Error('Failed to update category');
    return res.json();
  },

  async deleteCategory(id: number, replacementCategoryId?: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacementCategoryId })
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete category' }));
      throw new Error(error.error || 'Failed to delete category');
    }
  },

  // Time entries
  async getTimeEntries(): Promise<TimeEntry[]> {
    const res = await apiFetch(`${API_BASE}/time-entries`);
    if (!res.ok) throw new Error('Failed to fetch time entries');
    return res.json();
  },

  async getActiveEntry(): Promise<TimeEntry | null> {
    const res = await apiFetch(`${API_BASE}/time-entries/active`);
    if (!res.ok) throw new Error('Failed to fetch active entry');
    return res.json();
  },

  async startEntry(category_id: number, description?: string): Promise<TimeEntry> {
    const res = await apiFetch(`${API_BASE}/time-entries/start`, {
      method: 'POST',
      body: JSON.stringify({ category_id, description })
    });
    if (!res.ok) throw new Error('Failed to start entry');
    return res.json();
  },

  async stopEntry(id: number): Promise<TimeEntry> {
    const res = await apiFetch(`${API_BASE}/time-entries/${id}/stop`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to stop entry');
    return res.json();
  },

  async updateEntry(id: number, data: Partial<TimeEntry>): Promise<TimeEntry> {
    const res = await apiFetch(`${API_BASE}/time-entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update entry');
    return res.json();
  },

  async deleteEntry(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/time-entries/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete entry');
  },

  async deleteEntriesByDate(date: string): Promise<{ deleted: number }> {
    const res = await apiFetch(`${API_BASE}/time-entries/by-date/${date}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to delete entries' }));
      throw new Error(error.error || 'Failed to delete entries');
    }
    return res.json();
  },

  async createManualEntry(category_id: number, start_time: string, end_time: string, description?: string): Promise<TimeEntry> {
    const res = await apiFetch(`${API_BASE}/time-entries`, {
      method: 'POST',
      body: JSON.stringify({ category_id, start_time, end_time, description })
    });
    if (!res.ok) throw new Error('Failed to create entry');
    return res.json();
  },

  // Analytics
  async getAnalytics(start: string, end: string): Promise<AnalyticsData> {
    const res = await apiFetch(`${API_BASE}/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  // Export
  async exportCSV(): Promise<string> {
    const res = await apiFetch(`${API_BASE}/export/csv`);
    if (!res.ok) throw new Error('Failed to export CSV');
    return res.text();
  },

  async importCSV(csv: string, columnMapping?: ColumnMapping, entries?: ImportEntry[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const res = await apiFetch(`${API_BASE}/export/csv`, {
      method: 'POST',
      body: JSON.stringify({ csv, columnMapping, entries })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to import CSV');
    }
    return res.json();
  },

  async previewCSV(csv: string, columnMapping?: ColumnMapping, timeOffsetMinutes?: number): Promise<CSVPreviewResponse> {
    const res = await apiFetch(`${API_BASE}/export/csv/preview`, {
      method: 'POST',
      body: JSON.stringify({ csv, columnMapping, timeOffsetMinutes })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to preview CSV');
    }
    return res.json();
  },

  // Settings
  async getSettings(): Promise<UserSettings> {
    const res = await apiFetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const res = await apiFetch(`${API_BASE}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to update settings');
    }
    return res.json();
  },

  // Settings
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
    // Clear session ID since we're now a registered user
    sessionId = null;
    localStorage.removeItem('sessionId');
    return data;
  },

  async resetAllData(): Promise<void> {
    const res = await apiFetch(`${API_BASE}/settings/reset`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to reset data');
  },

  async updateAccount(data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/update`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Update failed');
    }
    const user = await res.json();
    setStoredUser(user);
    return user;
  },

  async deleteAccount(): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/delete`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete account');
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
