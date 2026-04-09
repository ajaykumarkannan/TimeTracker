import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import { formatTime, formatTimeCompact, formatDuration, formatDate } from '../utils/timeUtils';
import { useTheme } from '../contexts/ThemeContext';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';
import { useTaskSuggestions } from '../hooks/useTaskSuggestions';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { useEntryEditor } from '../hooks/useEntryEditor';
import { useManualEntry } from '../hooks/useManualEntry';
import { useCleanupSuggestions } from '../hooks/useCleanupSuggestions';
import { InlineCategoryForm } from './InlineCategoryForm';
import { TaskSuggestionInput } from './TaskSuggestionInput';
import { Modal } from './Modal';
import './TimeEntryList.css';

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}


interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  onEntryChange: (optimistic?: { active?: TimeEntry | null; stopped?: TimeEntry }, options?: { skipListRefresh?: boolean }) => void;
  onCategoryChange: () => void;
  refreshKey?: number;
  lastOptimistic?: { active?: TimeEntry | null; stopped?: TimeEntry } | null;
}

export function TimeEntryList({ categories, activeEntry, onEntryChange, onCategoryChange, refreshKey, lastOptimistic }: Props) {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  // Swipe-to-reveal gesture (extracted hook)
  const {
    swipedEntryId, setSwipedEntryId, swipeDidDrag,
    handleSwipePointerDown, handleSwipePointerMove, handleSwipePointerUp, handleSwipeWheel,
  } = useSwipeGesture();

  // Mobile detection ref (shared with useEntryEditor)
  const isMobileRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isMobileRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { isMobileRef.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Filter state
  const FILTER_STORAGE_KEY = 'chronoflow:historyFilters';
  const getStoredFilters = (): {
    searchQuery?: string;
    categoryFilter?: number | 'all';
    showFilters?: boolean;
  } => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const stored = getStoredFilters();
  const [searchQuery, setSearchQuery] = useState(stored.searchQuery ?? '');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>(stored.categoryFilter ?? 'all');
  const [showFilters, setShowFilters] = useState(stored.showFilters ?? false);
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'all' | null>('week');

  // Debounce search query to avoid excessive API calls while typing
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Initialize date filters - default to "This Week" (Monday to Friday)
  const getWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(monday), to: fmt(friday) };
  };
  const weekRange = getWeekRange();
  const [dateFrom, setDateFrom] = useState(weekRange.from);
  const [dateTo, setDateTo] = useState(weekRange.to);

  // Persist filter state to localStorage (date filters always reset to "This Week" on refresh)
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        searchQuery, categoryFilter, showFilters
      }));
    } catch { /* ignore storage errors */ }
  }, [searchQuery, categoryFilter, showFilters]);

  // Inline entry editor hook (editing state, handlers for category/description/time edits)
  const editor = useEntryEditor({
    entries,
    categories,
    activeEntry,
    onEntryChange,
    onCategoryChange,
    isMobileRef,
    setEntries,
    closeInlineSuggestions: () => inlineSuggestions.close(),
  });

  // Task name suggestions for inline edit
  const inlineSuggestions = useTaskSuggestions({
    value: editor.editField === 'description' ? editor.editDescription : '',
    entryCount: entries.length,
    preferCategoryId: editor.editCategory || null,
    tiebreaker: 'recency',
    autoOpen: false,
  });

  const handleInlineSuggestionSelect = (suggestion: { task_name: string; categoryId: number }) => {
    editor.setEditDescription(suggestion.task_name);
    editor.setEditCategory(suggestion.categoryId);
    inlineSuggestions.completeSelection();
  };

  // Load entries based on date filter
  const loadEntries = useCallback(async (background = false) => {
    // Only show loading spinner on initial load, not background refreshes
    if (!background) setLoading(true);
    try {
      // Convert local date strings to local timezone ISO strings
      // This ensures the server filters based on the user's intended local dates
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (dateFrom) {
        const [year, month, day] = dateFrom.split('-').map(Number);
        const localStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        startDate = localStart.toISOString();
      }

      if (dateTo) {
        const [year, month, day] = dateTo.split('-').map(Number);
        const localEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
        endDate = localEnd.toISOString();
      }

      // Pass category and search filters to server for proper filtering across all entries
      const categoryIdParam = categoryFilter !== 'all' ? categoryFilter : undefined;
      const searchParam = debouncedSearchQuery.trim() || undefined;

      const data = await api.getTimeEntries(startDate, endDate, categoryIdParam, searchParam);
      setEntries(data);
    } catch (error) {
      console.error('Failed to load entries:', error);
    }
    if (!background) setLoading(false);
  }, [dateFrom, dateTo, categoryFilter, debouncedSearchQuery]);

  // Load entries when date filter changes
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Reload entries when parent signals a change via refreshKey
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      loadEntries(true); // background refresh — no loading spinner
    }
  }, [refreshKey, loadEntries]);

  // Apply optimistic updates from parent without a full reload
  useEffect(() => {
    if (!lastOptimistic) return;
    const { stopped, active } = lastOptimistic;
    setEntries(prev => {
      let updated = prev;
      if (stopped) {
        updated = updated.map(e => e.id === stopped.id ? stopped : e);
      }
      if (active) {
        if (!updated.some(e => e.id === active.id)) {
          updated = [active, ...updated];
        }
      }
      return updated;
    });
  }, [lastOptimistic]);

  // Reload entries when onEntryChange is triggered externally
  const handleEntryChangeInternal = useCallback(async () => {
    await loadEntries();
    // Skip the entryRefreshKey bump in App since we already refreshed the list above
    onEntryChange(undefined, { skipListRefresh: true });
  }, [loadEntries, onEntryChange]);

  // Manual entry form (extracted hook)
  const manualEntry = useManualEntry({
    categories,
    onEntryChange: handleEntryChangeInternal,
    entryCount: entries.length,
  });

  // Cleanup suggestions (extracted hook)
  const cleanup = useCleanupSuggestions({
    entries,
    categories,
    activeEntry,
    onEntryChange: handleEntryChangeInternal,
    loadEntries,
  });

  // Check for overlaps with other entries (with 1-minute tolerance for back-to-back meetings)
  const checkOverlap = (entryId: number, start: Date, end: Date | null): TimeEntry | null => {
    if (!end) return null;

    const ONE_MINUTE_MS = 60 * 1000;

    for (const entry of entries) {
      if (entry.id === entryId) continue;

      const entryStart = new Date(entry.start_time);
      const entryEnd = entry.end_time ? new Date(entry.end_time) : new Date();

      // Check if ranges overlap
      if (start < entryEnd && end > entryStart) {
        // Calculate the actual overlap duration
        const overlapStart = Math.max(start.getTime(), entryStart.getTime());
        const overlapEnd = Math.min(end.getTime(), entryEnd.getTime());
        const overlapMs = overlapEnd - overlapStart;

        // Ignore overlaps of 1 minute or less (tolerance for back-to-back meetings)
        if (overlapMs <= ONE_MINUTE_MS) {
          continue;
        }

        return entry;
      }
    }
    return null;
  };

  // Get overlaps for display
  const overlaps = useMemo(() => {
    const result: { [id: number]: TimeEntry } = {};
    for (const entry of entries) {
      if (!entry.end_time) continue;
      const start = new Date(entry.start_time);
      const end = new Date(entry.end_time);
      const overlap = checkOverlap(entry.id, start, end);
      if (overlap) {
        result[entry.id] = overlap;
      }
    }
    return result;
  }, [entries]);

  // Detect entries with invalid time ranges (start >= end)
  const invalidTimeRanges = useMemo(() => {
    const result = new Set<number>();
    for (const entry of entries) {
      if (entry.end_time && new Date(entry.start_time) >= new Date(entry.end_time)) {
        result.add(entry.id);
      }
    }
    return result;
  }, [entries]);

  // Filter entries based on search, category, and date range
  // Note: Primary filtering is now done server-side, but we keep client-side date filtering
  // for accurate display grouping based on local timezone
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Date range filter (client-side for accurate local timezone handling)
      const entryDate = new Date(entry.start_time);
      if (dateFrom) {
        // Parse YYYY-MM-DD as local date by splitting and using Date constructor
        const [year, month, day] = dateFrom.split('-').map(Number);
        const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (entryDate < fromDate) return false;
      }
      if (dateTo) {
        const [year, month, day] = dateTo.split('-').map(Number);
        const toDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (entryDate > toDate) return false;
      }

      return true;
    });
  }, [entries, dateFrom, dateTo]);

  const hasActiveFilters = searchQuery || categoryFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setDateFrom('');
    setDateTo('');
    setActivePreset(null);
  };

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    // Format as YYYY-MM-DD in local timezone
    const formatDateLocal = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      setActivePreset('all');
      return;
    }

    let fromDate: Date;

    if (preset === 'today') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    } else if (preset === 'week') {
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
      fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
      const fridayDate = new Date(fromDate);
      fridayDate.setDate(fridayDate.getDate() + 4); // Monday + 4 = Friday
      setDateFrom(formatDateLocal(fromDate));
      setDateTo(formatDateLocal(fridayDate));
      setActivePreset(preset);
      return;
    } else { // month
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    setDateFrom(formatDateLocal(fromDate));
    setDateTo(formatDateLocal(today));
    setActivePreset(preset);
  };

  const handleSelect = (id: number) => {
    // Don't clear editing state when clicking within the same entry being edited.
    // On PC, clicks on padding/whitespace inside entry-item bubble up here
    // and would close the editor unexpectedly.
    if (editor.editingId !== null && editor.editingId === id) {
      setSelected(id);
      return;
    }
    if (editor.editingId !== null) {
      editor.setEditingId(null);
      editor.setEditField(null);
      editor.editingIdRef.current = null;
      editor.editFieldRef.current = null;
    }
    setSelected(id);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    const wasActive = activeEntry?.id === id;
    // Optimistic: remove from local list immediately
    setEntries(prev => prev.filter(e => e.id !== id));
    try {
      await api.deleteEntry(id);
      // Notify parent with optimistic removal so it doesn't do a full refetch
      if (wasActive) {
        onEntryChange({ active: null });
      } else {
        // Tell App to refresh its recent entries list (lightweight: 2 requests instead of 4-5)
        onEntryChange(undefined, { skipListRefresh: true });
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
      // Rollback: reload entries on failure
      loadEntries();
    }
  };

  const handleResume = async (entry: TimeEntry) => {
    try {
      await api.updateEntry(entry.id, { end_time: null } as Partial<TimeEntry>);
      onEntryChange({ active: { ...entry, end_time: null, duration_minutes: null } as unknown as TimeEntry });
      loadEntries();
    } catch (error) {
      console.error('Failed to resume entry:', error);
    }
  };

  const handleRestart = async (entry: TimeEntry) => {
    try {
      const newEntry = await api.startEntry(entry.category_id, entry.task_name || undefined);
      onEntryChange({ active: newEntry });
      loadEntries();
    } catch (error) {
      console.error('Failed to restart entry:', error);
    }
  };

  const handleDeleteDay = async (dateKey: string) => {
    const date = new Date(dateKey);
    const dateStr = date.toISOString().split('T')[0];
    const dayEntries = grouped[dateKey] || [];
    const totalCount = dayEntries.length;
    const hasActive = dayEntries.some(e => !e.end_time);

    if (totalCount === 0) {
      alert('No entries to delete for this day.');
      return;
    }

    const activeNote = hasActive ? ' (including running timer)' : '';
    if (!confirm(`Delete all ${totalCount} ${totalCount === 1 ? 'entry' : 'entries'} for ${formatDate(dayEntries[0].start_time)}${activeNote}?`)) {
      return;
    }

    try {
      await api.deleteEntriesByDate(dateStr);
      if (hasActive) {
        onEntryChange({ active: null });
      }
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entries:', error);
      alert('Failed to delete entries. Please try again.');
    }
  };

  const getTotalMinutes = () => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  };

  // Find the most recently completed entry (latest end_time) for resume vs restart logic
  const RESUME_STALE_HOURS = 4;
  const { mostRecentCompletedId, isMostRecentFresh } = useMemo(() => {
    const completed = filteredEntries.filter((e): e is TimeEntry & { end_time: string } => !!e.end_time);
    if (completed.length === 0) return { mostRecentCompletedId: null, isMostRecentFresh: false };
    const latest = completed.reduce((a, b) =>
      new Date(b.end_time).getTime() > new Date(a.end_time).getTime() ? b : a
    );
    const elapsedMs = Date.now() - new Date(latest.end_time).getTime();
    return {
      mostRecentCompletedId: latest.id,
      isMostRecentFresh: elapsedMs < RESUME_STALE_HOURS * 3600_000,
    };
  }, [filteredEntries]);

  const groupByDate = () => {
    const groups: { [key: string]: TimeEntry[] } = {};
    filteredEntries.forEach(entry => {
      const date = new Date(entry.start_time).toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  };

  const grouped = groupByDate();
  const totalMinutes = getTotalMinutes();

  const renderTimeEditForm = (field: 'startTime' | 'endTime', entry: TimeEntry) => (
    <form
      className="inline-edit-time-form"
      onSubmit={(e) => editor.handleTimeInputSubmit(e, entry.id)}
      onKeyDown={(e) => editor.handleKeyDown(e, entry.id)}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="time"
        className="inline-edit-time inline-edit-time-only"
        value={field === 'startTime' ? editor.editStartTimeOnly : editor.editEndTimeOnly}
        onChange={(e) => (field === 'startTime' ? editor.handleEditStartTimeOnlyChange : editor.handleEditEndTimeOnlyChange)(e.target.value)}
        onBlur={(e) => editor.handleTimeBlur(entry.id, field, e)}
        autoFocus
      />
      <input
        type="date"
        className="inline-edit-time inline-edit-date"
        value={field === 'startTime' ? editor.editStartDate : editor.editEndDate}
        onChange={(e) => (field === 'startTime' ? editor.handleEditStartDateChange : editor.handleEditEndDateChange)(e.target.value)}
        onBlur={(e) => editor.handleTimeBlur(entry.id, field, e)}
      />
      <button type="submit" className="inline-edit-save-btn" title="Save">✓</button>
      <button type="button" className="inline-edit-cancel-btn" onClick={editor.handleCancel} title="Cancel">✕</button>
      {editor.editTimeError && <span className="inline-edit-time-error">{editor.editTimeError}</span>}
    </form>
  );

  const renderActionButtons = (variant: 'desktop' | 'mobile', entry: TimeEntry) => {
    const isResumable = entry.id === mostRecentCompletedId && !activeEntry && isMostRecentFresh;
    const dismiss = variant === 'mobile' ? () => setSwipedEntryId(null) : undefined;
    const stop = (e: React.MouseEvent) => e.stopPropagation();

    if (!entry.end_time) {
      return variant === 'desktop' ? (
        <div className="entry-actions">
          <span className="btn-icon" style={{ visibility: 'hidden' }}>↻</span>
          <button className="btn-icon delete-btn" onClick={(e) => { stop(e); handleDelete(entry.id); }} title="Delete">×</button>
        </div>
      ) : (
        <button className="swipe-action-btn delete" onClick={(e) => { stop(e); dismiss?.(); handleDelete(entry.id); }}>×</button>
      );
    }

    if (variant === 'desktop') {
      return (
        <div className="entry-actions">
          {isResumable ? (
            <button className="btn-icon resume-btn" onClick={(e) => { stop(e); handleResume(entry); }} title="Resume">▶</button>
          ) : (
            <button className="btn-icon restart-btn" onClick={(e) => { stop(e); handleRestart(entry); }} title="Start new">↻</button>
          )}
          <button className="btn-icon delete-btn" onClick={(e) => { stop(e); handleDelete(entry.id); }} title="Delete">×</button>
        </div>
      );
    }

    return (
      <>
        {isResumable ? (
          <>
            <button className="swipe-action-btn resume" onClick={(e) => { stop(e); dismiss?.(); handleResume(entry); }}>▶</button>
            <button className="swipe-action-btn restart" onClick={(e) => { stop(e); dismiss?.(); handleRestart(entry); }}>↻</button>
          </>
        ) : (
          <button className="swipe-action-btn restart" onClick={(e) => { stop(e); dismiss?.(); handleRestart(entry); }}>↻</button>
        )}
        <button className="swipe-action-btn delete" onClick={(e) => { stop(e); dismiss?.(); handleDelete(entry.id); }}>×</button>
      </>
    );
  };

  return (
    <div className="time-entry-list card">
      <div className="card-header">
        <h2 className="card-title">History</h2>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={manualEntry.openManualEntry}>+ <span className="add-entry-label">Add Entry</span></button>
          <button
            className={`btn-icon filter-toggle ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round"/>
            </svg>
            {hasActiveFilters && <span className="filter-badge" />}
          </button>
          <div className="total-badge">
            {formatDuration(totalMinutes)}
            {hasActiveFilters && entries.length !== filteredEntries.length && (
              <span className="filtered-count"> ({filteredEntries.length}/{entries.length})</span>
            )}
          </div>
        </div>
      </div>

      {manualEntry.showManualEntry && (
        <Modal title="Add Past Entry" onClose={manualEntry.closeManualEntry} className="manual-entry-modal">
            <div className="manual-entry-form">
              <div className="form-group">
                <label>Category</label>
                <select
                  value={manualEntry.manualCategory}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'new') {
                      manualEntry.setShowManualNewCategory(true);
                    } else {
                      manualEntry.setManualCategory(val ? Number(val) : '');
                      manualEntry.setShowManualNewCategory(false);
                    }
                  }}
                >
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  <option value="new">+ Add category</option>
                </select>
              </div>

              {/* Inline category creation form */}
              {manualEntry.showManualNewCategory && (
                <div className="new-category-form animate-slide-in">
                  <InlineCategoryForm
                    variant="labeled"
                    onCreated={(category) => {
                      manualEntry.setManualCategory(category.id);
                      manualEntry.setShowManualNewCategory(false);
                      onCategoryChange();
                    }}
                    onCancel={() => manualEntry.setShowManualNewCategory(false)}
                  />
                </div>
              )}
              <div className="form-group">
                <label>Task <span className="optional">(optional)</span></label>
                <TaskSuggestionInput
                  value={manualEntry.manualDescription}
                  onChange={manualEntry.setManualDescription}
                  onFocus={manualEntry.manualSuggestions.handleFocus}
                  onKeyDown={(e) => {
                    const selected = manualEntry.manualSuggestions.handleKeyDown(e);
                    if (selected) manualEntry.handleManualSuggestionSelect(selected);
                  }}
                  inputRef={manualEntry.manualSuggestions.inputRef}
                  listRef={manualEntry.manualSuggestions.listRef}
                  suggestions={manualEntry.manualSuggestions.suggestions}
                  show={manualEntry.manualSuggestions.showSuggestions}
                  selectedIndex={manualEntry.manualSuggestions.selectedIndex}
                  onSelect={manualEntry.handleManualSuggestionSelect}
                  onHover={manualEntry.manualSuggestions.setSelectedIndex}
                  categories={categories}
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={manualEntry.manualStartTime} onChange={(e) => manualEntry.handleStartTimeChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={manualEntry.manualStartDate} onChange={(e) => manualEntry.handleStartDateChange(e.target.value)} />
                </div>
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>End Time</label>
                  <input type="time" value={manualEntry.manualEndTime} onChange={(e) => manualEntry.handleEndTimeChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={manualEntry.manualEndDate} onChange={(e) => manualEntry.handleEndDateChange(e.target.value)} />
                </div>
              </div>
              {manualEntry.manualError && <div className="manual-entry-error">{manualEntry.manualError}</div>}
              <div className="manual-entry-actions">
                <button className="btn btn-ghost" onClick={manualEntry.closeManualEntry}>Cancel</button>
                <button className="btn btn-primary" onClick={manualEntry.handleManualSubmit} disabled={manualEntry.isSubmitting}>
                  {manualEntry.isSubmitting ? 'Adding...' : 'Add Entry'}
                </button>
              </div>
            </div>
        </Modal>
      )}

      {showFilters && (
        <div className="filters-panel">
          <div className="date-presets">
            <button
              className={`preset-btn ${activePreset === 'today' ? 'active' : ''}`}
              onClick={() => applyDatePreset('today')}
            >
              Today
            </button>
            <button
              className={`preset-btn ${activePreset === 'week' ? 'active' : ''}`}
              onClick={() => applyDatePreset('week')}
            >
              This Week
            </button>
            <button
              className={`preset-btn ${activePreset === 'month' ? 'active' : ''}`}
              onClick={() => applyDatePreset('month')}
            >
              This Month
            </button>
            <button
              className={`preset-btn ${activePreset === 'all' ? 'active' : ''}`}
              onClick={() => applyDatePreset('all')}
            >
              All Time
            </button>
          </div>
          <div className="filter-row">
            <div className="filter-group search-group">
              <input
                type="text"
                className="filter-input search-input"
                placeholder="Search tasks & categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
            <div className="filter-group">
              <select
                className="filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-row">
            <div className="filter-group date-group">
              <label className="filter-label">From</label>
              <input
                type="date"
                className="filter-input date-input"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setActivePreset(null); }}
              />
            </div>
            <div className="filter-group date-group">
              <label className="filter-label">To</label>
              <input
                type="date"
                className="filter-input date-input"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setActivePreset(null); }}
              />
            </div>
            {hasActiveFilters && (
              <button className="btn-text clear-filters" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cleanup suggestions banner */}
      {cleanup.showCleanupBanner && cleanup.hasCleanupSuggestions && (
        <div className="cleanup-banner">
          <div className="cleanup-header">
            <span className="cleanup-icon">🧹</span>
            <span className="cleanup-title">Cleanup Suggestions</span>
            <button className="btn btn-sm btn-primary cleanup-apply-all" onClick={cleanup.handleApplyAll}>
              Apply All
            </button>
            <button className="btn-icon cleanup-close" onClick={() => cleanup.setShowCleanupBanner(false)}>×</button>
          </div>

          {cleanup.mergeCandidates.map((candidate, idx) => {
            const totalMinutes = candidate.entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
            return (
              <div key={idx} className="cleanup-item">
                <div className="cleanup-item-info">
                  <span className="cleanup-item-icon">🔗</span>
                  <span className="cleanup-item-text">
                    Merge {candidate.entries.length} consecutive "{candidate.categoryName}" entries
                    {candidate.description && <span className="cleanup-description"> ({candidate.description})</span>}
                    <span className="cleanup-duration"> — {formatDuration(totalMinutes)} total</span>
                  </span>
                </div>
                <div className="cleanup-item-actions">
                  <button className="btn btn-sm btn-primary" onClick={() => cleanup.handleMergeEntries(candidate)}>Merge</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => cleanup.handleDismissMerge(candidate)}>Dismiss</button>
                </div>
              </div>
            );
          })}

          {cleanup.shortEntries.map(({ entry, durationSeconds }) => (
            <div key={entry.id} className="cleanup-item">
              <div className="cleanup-item-info">
                <span className="cleanup-item-icon">⏱️</span>
                <span className="cleanup-item-text">
                  Short entry: "{entry.category_name}"
                  {entry.task_name && <span className="cleanup-description"> ({entry.task_name})</span>}
                  <span className="cleanup-duration"> — {durationSeconds}s</span>
                </span>
              </div>
              <div className="cleanup-item-actions">
                <button className="btn btn-sm btn-danger" onClick={() => cleanup.handleDeleteShortEntry(entry)}>Delete</button>
                <button className="btn btn-sm btn-ghost" onClick={() => cleanup.handleDismissShortEntry(entry.id)}>Keep</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" />
          <p>Loading entries...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No entries yet</p>
          <p className="empty-hint">Start tracking to build your history</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No matching entries</p>
          <p className="empty-hint">Try adjusting your filters</p>
          <button className="btn-text" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className="entries-by-date">
          {Object.entries(grouped).map(([dateKey, dateEntries]) => (
            <div key={dateKey} className="date-group">
              <div className="date-header">
                <span>{formatDate(dateEntries[0].start_time)}</span>
                <div className="date-header-actions">
                  <span className="day-total-badge">
                    {formatDuration(dateEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0))}
                  </span>
                  <button
                    className="btn-icon delete-day-btn"
                    onClick={() => handleDeleteDay(dateKey)}
                    title="Delete all entries for this day"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4M12.667 4v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="entries">
                {dateEntries.map((entry, index) => {
                  const isEditing = editor.editingId === entry.id;
                  const isSelected = selected === entry.id;
                  const hasOverlap = overlaps[entry.id];
                  const hasInvalidRange = invalidTimeRanges.has(entry.id);

                  // Calculate break from previous entry (entries are sorted by start_time desc)
                  // So "previous" in the list is actually the entry that started AFTER this one
                  const prevEntry = index > 0 ? dateEntries[index - 1] : null;
                  let breakMinutes = 0;
                  let breakStartTime = '';
                  let breakEndTime = '';
                  if (prevEntry && entry.end_time && prevEntry.start_time) {
                    const thisEnd = new Date(entry.end_time).getTime();
                    const prevStart = new Date(prevEntry.start_time).getTime();
                    breakMinutes = Math.round((prevStart - thisEnd) / 60000);
                    breakStartTime = entry.end_time;
                    breakEndTime = prevEntry.start_time;
                  }
                  const showBreak = breakMinutes > 5;

                  return (
                    <div key={entry.id}>
                      {showBreak && (
                        <button
                          className="break-indicator"
                          onClick={() => manualEntry.openBreakEntry(breakStartTime, breakEndTime)}
                          title="Click to add entry for this break"
                        >
                          <span className="break-line" />
                          <span className="break-text">{formatDuration(breakMinutes)} break</span>
                          <span className="break-line" />
                        </button>
                      )}
                      <div
                         className={`entry-item ${index % 2 === 1 ? 'entry-striped' : ''} ${isSelected ? 'selected' : ''} ${swipedEntryId === entry.id ? 'swiped' : ''} ${entry.id === mostRecentCompletedId && !activeEntry && isMostRecentFresh && entry.end_time ? 'swiped-wide' : ''}`}
                        onClick={() => { if (swipeDidDrag.current) { swipeDidDrag.current = false; return; } if (swipedEntryId === entry.id) { setSwipedEntryId(null); } else { handleSelect(entry.id); } }}
                        onPointerDown={(e) => handleSwipePointerDown(entry.id, e)}
                        onPointerMove={handleSwipePointerMove}
                        onPointerUp={handleSwipePointerUp}
                        onPointerCancel={handleSwipePointerUp}
                        onWheel={(e) => handleSwipeWheel(entry.id, e)}
                        onPointerLeave={(e) => {
                          // On desktop (mouse), dismiss when pointer leaves the entry row
                          if (e.pointerType === 'mouse' && swipedEntryId === entry.id) {
                            setSwipedEntryId(null);
                          }
                        }}
                      >

                      <div className="entry-content">
                        <div className="entry-main">
                          {isEditing && editor.editField === 'category' ? (
                            editor.showNewCategory ? (
                              <div className="inline-new-category" onClick={(e) => e.stopPropagation()}>
                                <InlineCategoryForm
                                  variant="compact"
                                  inputClassName="inline-edit-input"
                                  colorClassName="inline-color-picker"
                                  saveBtnClassName="inline-edit-save-btn"
                                  cancelBtnClassName="inline-edit-cancel-btn"
                                  onCreated={(category) => {
                                    editor.setEditCategory(category.id);
                                    editor.setShowNewCategory(false);
                                    onCategoryChange();
                                  }}
                                  onCancel={() => editor.setShowNewCategory(false)}
                                />
                              </div>
                            ) : (
                              <select
                                className="inline-edit-select"
                                value={editor.editCategory}
                                onChange={(e) => editor.handleCategorySelectChange(e, entry.id)}
                                onBlur={(e) => !editor.showNewCategory && editor.handleDeferredBlur(entry.id, 'category', e)}
                                onKeyDown={(e) => editor.handleKeyDown(e, entry.id)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              >
                                {categories.map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                                <option value="new">+ Add Category</option>
                              </select>
                            )
                          ) : (() => {
                            const colors = getAdaptiveCategoryColors(entry.category_color, isDarkMode);
                            return (
                              <span
                                className="entry-category category-badge editable"
                                style={{ backgroundColor: colors.bgColor, color: colors.textColor }}
                                onClick={(e) => { e.stopPropagation(); editor.startEdit(entry, 'category'); }}
                              >
                                <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                                <span className="category-badge-text">{entry.category_name}</span>
                              </span>
                            );
                          })()}
                          {isEditing && editor.editField === 'description' ? (
                            <TaskSuggestionInput
                              value={editor.editDescription}
                              onChange={(val) => { editor.setEditDescription(val); inlineSuggestions.clearSuppress(); }}
                              onFocus={inlineSuggestions.handleFocus}
                              onBlur={(e) => {
                                // Don't save if focus moves into the suggestion dropdown
                                const target = e.relatedTarget as HTMLElement | null;
                                if (target?.closest('.description-suggestions')) return;
                                editor.handleDeferredBlur(entry.id, 'description', e);
                              }}
                              onKeyDown={(e) => {
                                const selected = inlineSuggestions.handleKeyDown(e, () => {
                                  // Enter without a highlighted suggestion → save
                                  e.preventDefault();
                                  e.stopPropagation();
                                  editor.enterSavingRef.current = true;
                                  editor.handleSave(entry.id);
                                });
                                if (selected) {
                                  handleInlineSuggestionSelect(selected);
                                } else if (e.key === 'Escape' && !inlineSuggestions.showSuggestions) {
                                  e.preventDefault();
                                  editor.handleCancel();
                                }
                              }}
                              placeholder="Add a task name..."
                              autoFocus
                              inputRef={inlineSuggestions.inputRef}
                              listRef={inlineSuggestions.listRef}
                              suggestions={inlineSuggestions.suggestions}
                              show={inlineSuggestions.showSuggestions}
                              selectedIndex={inlineSuggestions.selectedIndex}
                              onSelect={handleInlineSuggestionSelect}
                              onHover={inlineSuggestions.setSelectedIndex}
                              categories={categories}
                              isDarkMode={isDarkMode}
                              className="inline-edit-suggestions"
                            />
                          ) : (
                            <span
                              className="entry-description editable"
                              onClick={(e) => { if (!isMobileRef.current) { e.stopPropagation(); editor.startEdit(entry, 'description'); } }}
                              onDoubleClick={(e) => { if (isMobileRef.current) { e.stopPropagation(); editor.startEdit(entry, 'description'); } }}
                            >
                              {entry.task_name || '—'}
                            </span>
                          )}
                        </div>
                        <div className="entry-meta">
                          {hasOverlap && (
                            <span className="overlap-warning" title={`Overlaps with: ${hasOverlap.category_name}`}>
                              ⚠️
                            </span>
                          )}
                          {hasInvalidRange && (
                            <span className="overlap-warning" title="Start time is after end time — click to fix">
                              ⛔
                            </span>
                          )}
                          {isEditing && editor.editField === 'startTime' && !editor.showTimeEditModal ? (
                            renderTimeEditForm('startTime', entry)
                          ) : (
                             <button
                              className="entry-time-btn editable"
                              onClick={(e) => { e.stopPropagation(); editor.startEdit(entry, 'startTime'); }}
                              title="Tap to edit start time"
                            >
                              <span className="time-full">{formatTime(entry.start_time)}</span>
                              <span className="time-compact">{formatTimeCompact(entry.start_time)}</span>
                            </button>
                          )}
                          <span className="end-time-group">
                            <span className="time-separator">&nbsp;–&nbsp;</span>
                            {isEditing && editor.editField === 'endTime' && !editor.showTimeEditModal ? (
                              renderTimeEditForm('endTime', entry)
                            ) : (
                              <button
                                className={`entry-time-btn editable ${!entry.end_time ? 'active-time' : ''}`}
                              onClick={(e) => {
                                if (entry.end_time) {
                                  e.stopPropagation();
                                  editor.startEdit(entry, 'endTime');
                                }
                              }}
                              disabled={!entry.end_time}
                              title={entry.end_time ? "Tap to edit end time" : "Currently tracking"}
                            >
                              {entry.end_time ? (
                                <>
                                  <span className="time-full">{formatTime(entry.end_time)}</span>
                                  <span className="time-compact">{formatTimeCompact(entry.end_time)}</span>
                                </>
                              ) : 'now'}
                            </button>
                          )}
                          </span>
                          <button
                            className={`entry-duration-btn ${!entry.end_time ? 'active' : ''}${entry.duration_minutes != null && entry.duration_minutes < 0 ? ' duration-negative' : ''}`}
                            onClick={(e) => { e.stopPropagation(); editor.startEdit(entry, 'startTime'); }}
                            title={entry.duration_minutes != null && entry.duration_minutes < 0 ? 'Warning: negative duration — start/end times may be incorrect' : 'Tap to edit times'}
                          >
                            {entry.duration_minutes != null && entry.duration_minutes < 0 && (
                              <span className="duration-warning-icon" aria-label="Warning">⚠</span>
                            )}
                            {formatDuration(entry.duration_minutes)}
                          </button>
                        </div>
                      </div>
                      {/* Desktop hover actions */}
                      {renderActionButtons('desktop', entry)}
                      {/* Mobile swipe actions */}
                      <div className="swipe-actions">
                        {renderActionButtons('mobile', entry)}
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile time-edit modal */}
      {editor.showTimeEditModal && editor.editingId && (
        <Modal title="Edit Time" onClose={editor.handleTimeModalClose} className="time-edit-modal">
            <div className="time-edit-body">
              <label className="time-edit-label">
                Start Time
                <input
                  type="time"
                  className="time-edit-input"
                  value={editor.editStartTimeOnly}
                  onChange={(e) => {
                    if (e.target.value) editor.handleEditStartTimeOnlyChange(e.target.value);
                  }}
                  autoFocus={editor.editField === 'startTime'}
                />
              </label>
              <label className="time-edit-label">
                Start Date
                <input
                  type="date"
                  className="time-edit-input"
                  value={editor.editStartDate}
                  onChange={(e) => {
                    if (e.target.value) editor.handleEditStartDateChange(e.target.value);
                  }}
                />
              </label>
              {editor.editEndTimeOnly !== '' && (
                <>
                  <label className="time-edit-label">
                    End Time
                    <input
                      type="time"
                      className="time-edit-input"
                      value={editor.editEndTimeOnly}
                      onChange={(e) => {
                        if (e.target.value) editor.handleEditEndTimeOnlyChange(e.target.value);
                      }}
                      autoFocus={editor.editField === 'endTime'}
                    />
                  </label>
                  <label className="time-edit-label">
                    End Date
                    <input
                      type="date"
                      className="time-edit-input"
                      value={editor.editEndDate}
                      onChange={(e) => {
                        if (e.target.value) editor.handleEditEndDateChange(e.target.value);
                      }}
                    />
                  </label>
                </>
              )}
              {editor.editTimeError && <div className="time-edit-error">{editor.editTimeError}</div>}
            </div>
            <div className="time-edit-actions">
              <button className="btn btn-secondary" onClick={editor.handleTimeModalClose}>Cancel</button>
              <button className="btn btn-primary" onClick={editor.handleTimeModalSave}>Save</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
