import { Category, TimeEntry, AnalyticsData } from './types';

const API_BASE = '/api';

export const api = {
  async getCategories(): Promise<Category[]> {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },

  async createCategory(name: string, color?: string): Promise<Category> {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    if (!res.ok) throw new Error('Failed to create category');
    return res.json();
  },

  async updateCategory(id: number, name: string, color?: string): Promise<Category> {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    if (!res.ok) throw new Error('Failed to update category');
    return res.json();
  },

  async deleteCategory(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete category');
  },

  async getTimeEntries(): Promise<TimeEntry[]> {
    const res = await fetch(`${API_BASE}/time-entries`);
    if (!res.ok) throw new Error('Failed to fetch time entries');
    return res.json();
  },

  async getActiveEntry(): Promise<TimeEntry | null> {
    const res = await fetch(`${API_BASE}/time-entries/active`);
    if (!res.ok) throw new Error('Failed to fetch active entry');
    return res.json();
  },

  async startEntry(category_id: number, note?: string): Promise<TimeEntry> {
    const res = await fetch(`${API_BASE}/time-entries/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id, note })
    });
    if (!res.ok) throw new Error('Failed to start entry');
    return res.json();
  },

  async stopEntry(id: number): Promise<TimeEntry> {
    const res = await fetch(`${API_BASE}/time-entries/${id}/stop`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to stop entry');
    return res.json();
  },

  async updateEntry(id: number, data: Partial<TimeEntry>): Promise<TimeEntry> {
    const res = await fetch(`${API_BASE}/time-entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update entry');
    return res.json();
  },

  async deleteEntry(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/time-entries/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete entry');
  },

  async getAnalytics(start: string, end: string): Promise<AnalyticsData> {
    const res = await fetch(`${API_BASE}/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  }
};
