import { Category, TimeEntry, AnalyticsData } from './types';

const STORAGE_KEYS = {
  categories: 'chronoflow_categories',
  entries: 'chronoflow_entries',
  mode: 'chronoflow_mode'
};

let nextCategoryId = 1;
let nextEntryId = 1;

function loadIds() {
  const categories = getCategories();
  const entries = getEntries();
  nextCategoryId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) + 1 : 1;
  nextEntryId = entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 1;
}

export function isLocalMode(): boolean {
  return localStorage.getItem(STORAGE_KEYS.mode) === 'local';
}

export function setLocalMode(enabled: boolean) {
  if (enabled) {
    localStorage.setItem(STORAGE_KEYS.mode, 'local');
    loadIds();
  } else {
    localStorage.removeItem(STORAGE_KEYS.mode);
  }
}

export function clearLocalMode() {
  localStorage.removeItem(STORAGE_KEYS.mode);
}

// Categories
function getCategories(): Category[] {
  const data = localStorage.getItem(STORAGE_KEYS.categories);
  return data ? JSON.parse(data) : [];
}

function saveCategories(categories: Category[]) {
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
}

// Entries
function getEntries(): TimeEntry[] {
  const data = localStorage.getItem(STORAGE_KEYS.entries);
  return data ? JSON.parse(data) : [];
}

function saveEntries(entries: TimeEntry[]) {
  localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
}

// Local API implementation
export const localApi = {
  async getCategories(): Promise<Category[]> {
    return getCategories();
  },

  async createCategory(name: string, color?: string): Promise<Category> {
    const categories = getCategories();
    const category: Category = {
      id: nextCategoryId++,
      name,
      color: color || null,
      created_at: new Date().toISOString()
    };
    categories.push(category);
    saveCategories(categories);
    return category;
  },

  async updateCategory(id: number, name: string, color?: string): Promise<Category> {
    const categories = getCategories();
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Category not found');
    
    categories[index] = { ...categories[index], name, color: color || null };
    saveCategories(categories);
    return categories[index];
  },

  async deleteCategory(id: number): Promise<void> {
    let categories = getCategories();
    categories = categories.filter(c => c.id !== id);
    saveCategories(categories);
    
    // Also delete associated entries
    let entries = getEntries();
    entries = entries.filter(e => e.category_id !== id);
    saveEntries(entries);
  },

  async getTimeEntries(): Promise<TimeEntry[]> {
    const entries = getEntries();
    const categories = getCategories();
    
    return entries
      .map(entry => {
        const cat = categories.find(c => c.id === entry.category_id);
        return {
          ...entry,
          category_name: cat?.name || 'Unknown',
          category_color: cat?.color || null
        };
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .slice(0, 100);
  },

  async getActiveEntry(): Promise<TimeEntry | null> {
    const entries = getEntries();
    const categories = getCategories();
    const active = entries.find(e => !e.end_time);
    
    if (!active) return null;
    
    const cat = categories.find(c => c.id === active.category_id);
    return {
      ...active,
      category_name: cat?.name || 'Unknown',
      category_color: cat?.color || null
    };
  },

  async startEntry(category_id: number, note?: string): Promise<TimeEntry> {
    const entries = getEntries();
    const categories = getCategories();
    
    // Stop any active entry
    const activeIndex = entries.findIndex(e => !e.end_time);
    if (activeIndex !== -1) {
      const active = entries[activeIndex];
      const endTime = new Date().toISOString();
      const duration = Math.round((new Date(endTime).getTime() - new Date(active.start_time).getTime()) / 60000);
      entries[activeIndex] = { ...active, end_time: endTime, duration_minutes: duration };
    }
    
    const cat = categories.find(c => c.id === category_id);
    const entry: TimeEntry = {
      id: nextEntryId++,
      category_id,
      category_name: cat?.name || 'Unknown',
      category_color: cat?.color || null,
      note: note || null,
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: new Date().toISOString()
    };
    
    entries.push(entry);
    saveEntries(entries);
    return entry;
  },

  async stopEntry(id: number): Promise<TimeEntry> {
    const entries = getEntries();
    const categories = getCategories();
    const index = entries.findIndex(e => e.id === id);
    
    if (index === -1) throw new Error('Entry not found');
    
    const entry = entries[index];
    const endTime = new Date().toISOString();
    const duration = Math.round((new Date(endTime).getTime() - new Date(entry.start_time).getTime()) / 60000);
    
    const cat = categories.find(c => c.id === entry.category_id);
    entries[index] = {
      ...entry,
      end_time: endTime,
      duration_minutes: duration,
      category_name: cat?.name || 'Unknown',
      category_color: cat?.color || null
    };
    
    saveEntries(entries);
    return entries[index];
  },

  async updateEntry(id: number, data: Partial<TimeEntry>): Promise<TimeEntry> {
    const entries = getEntries();
    const categories = getCategories();
    const index = entries.findIndex(e => e.id === id);
    
    if (index === -1) throw new Error('Entry not found');
    
    entries[index] = { ...entries[index], ...data };
    const cat = categories.find(c => c.id === entries[index].category_id);
    entries[index].category_name = cat?.name || 'Unknown';
    entries[index].category_color = cat?.color || null;
    
    saveEntries(entries);
    return entries[index];
  },

  async deleteEntry(id: number): Promise<void> {
    let entries = getEntries();
    entries = entries.filter(e => e.id !== id);
    saveEntries(entries);
  },

  async getAnalytics(start: string, end: string): Promise<AnalyticsData> {
    const entries = getEntries();
    const categories = getCategories();
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const filteredEntries = entries.filter(e => {
      const entryDate = new Date(e.start_time);
      return entryDate >= startDate && entryDate < endDate;
    });
    
    // By category
    const byCategory = categories.map(cat => {
      const catEntries = filteredEntries.filter(e => e.category_id === cat.id);
      return {
        name: cat.name,
        color: cat.color || '#6366f1',
        minutes: catEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0),
        count: catEntries.length
      };
    }).filter(c => c.minutes > 0 || c.count > 0).sort((a, b) => b.minutes - a.minutes);
    
    // Daily totals
    const dailyMap: { [key: string]: number } = {};
    filteredEntries.forEach(e => {
      const date = new Date(e.start_time).toISOString().split('T')[0];
      dailyMap[date] = (dailyMap[date] || 0) + (e.duration_minutes || 0);
    });
    
    const daily = Object.entries(dailyMap)
      .map(([date, minutes]) => ({ date, minutes, byCategory: {} }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Top notes
    const noteMap: { [key: string]: { count: number; minutes: number } } = {};
    filteredEntries.forEach(e => {
      if (e.note) {
        if (!noteMap[e.note]) noteMap[e.note] = { count: 0, minutes: 0 };
        noteMap[e.note].count++;
        noteMap[e.note].minutes += e.duration_minutes || 0;
      }
    });
    
    const topNotes = Object.entries(noteMap)
      .map(([note, data]) => ({ note, count: data.count, total_minutes: data.minutes }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Summary
    const totalMinutes = byCategory.reduce((sum, c) => sum + c.minutes, 0);
    const totalEntries = filteredEntries.length;
    const avgMinutesPerDay = daily.length > 0 ? Math.round(totalMinutes / daily.length) : 0;
    
    // Previous period
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength);
    const prevEntries = entries.filter(e => {
      const entryDate = new Date(e.start_time);
      return entryDate >= prevStart && entryDate < startDate;
    });
    const previousTotal = prevEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    const change = previousTotal > 0 ? Math.round(((totalMinutes - previousTotal) / previousTotal) * 100) : 0;
    
    return {
      period: { start, end },
      summary: { totalMinutes, totalEntries, avgMinutesPerDay, previousTotal, change },
      byCategory,
      daily,
      topNotes
    };
  }
};

// Initialize IDs on load
if (isLocalMode()) {
  loadIds();
}
