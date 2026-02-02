import { useState, useMemo, useEffect, useCallback } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import { formatTime, formatDuration, formatDate, formatDateTimeLocal, formatDateOnly, formatTimeOnly, combineDateAndTime } from '../utils/timeUtils';
import './TimeEntryList.css';

interface Props {
  categories: Category[];
  onEntryChange: () => void;
  refreshKey?: number;
}

type EditField = 'category' | 'description' | 'startTime' | 'endTime' | null;

interface MergeCandidate {
  entries: TimeEntry[];
  categoryName: string;
  description: string | null;
}

interface ShortEntry {
  entry: TimeEntry;
  durationSeconds: number;
}

export function TimeEntryList({ categories, onEntryChange, refreshKey }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>(null);
  const [editCategory, setEditCategory] = useState<number>(0);
  const [editDescription, setEditDescription] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'all' | null>('week');
  
  // Initialize date filters to "This Week" on mount
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const fromDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    return `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  
  // Manual entry form state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCategory, setManualCategory] = useState<number | ''>('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualError, setManualError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Cleanup suggestions state
  const [showCleanupBanner, setShowCleanupBanner] = useState(true);
  const [dismissedMerges, setDismissedMerges] = useState<Set<string>>(new Set());
  const [dismissedShortEntries, setDismissedShortEntries] = useState<Set<number>>(new Set());

  // Load entries based on date filter
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined;
      const endDate = dateTo ? `${dateTo}T23:59:59.999Z` : undefined;
      const data = await api.getTimeEntries(startDate, endDate);
      setEntries(data);
    } catch (error) {
      console.error('Failed to load entries:', error);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  // Load entries when date filter changes
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Reload entries when parent signals a change via refreshKey
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      loadEntries();
    }
  }, [refreshKey, loadEntries]);

  // Reload entries when onEntryChange is triggered externally
  const handleEntryChangeInternal = useCallback(async () => {
    await loadEntries();
    onEntryChange();
  }, [loadEntries, onEntryChange]);

  // Detect back-to-back entries that can be merged (same category + note, consecutive)
  const mergeCandidates = useMemo((): MergeCandidate[] => {
    const candidates: MergeCandidate[] = [];
    // Sort by start time ascending to find consecutive entries
    const sorted = [...entries]
      .filter(e => e.end_time) // Only completed entries
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    
    let i = 0;
    while (i < sorted.length) {
      const current = sorted[i];
      const group: TimeEntry[] = [current];
      
      // Look for consecutive entries with same category and note
      let j = i + 1;
      while (j < sorted.length) {
        const next = sorted[j];
        const prev = group[group.length - 1];
        
        // Check if same category and description
        if (next.category_id !== current.category_id || next.description !== current.description) break;
        
        // Check if back-to-back (within 1 minute gap)
        const prevEnd = new Date(prev.end_time!).getTime();
        const nextStart = new Date(next.start_time).getTime();
        const gapMs = nextStart - prevEnd;
        
        if (gapMs < 0 || gapMs > 60000) break; // More than 1 minute gap
        
        group.push(next);
        j++;
      }
      
      if (group.length > 1) {
        const key = group.map(e => e.id).sort((a, b) => a - b).join('-');
        if (!dismissedMerges.has(key)) {
          candidates.push({
            entries: group,
            categoryName: current.category_name,
            description: current.description
          });
        }
      }
      
      i = j > i + 1 ? j : i + 1;
    }
    
    return candidates;
  }, [entries, dismissedMerges]);

  // Detect entries less than 1 minute
  const shortEntries = useMemo((): ShortEntry[] => {
    return entries
      .filter(e => {
        if (!e.end_time || dismissedShortEntries.has(e.id)) return false;
        const start = new Date(e.start_time).getTime();
        const end = new Date(e.end_time).getTime();
        const durationMs = end - start;
        return durationMs < 60000 && durationMs >= 0;
      })
      .map(e => ({
        entry: e,
        durationSeconds: Math.round((new Date(e.end_time!).getTime() - new Date(e.start_time).getTime()) / 1000)
      }));
  }, [entries, dismissedShortEntries]);

  const hasCleanupSuggestions = mergeCandidates.length > 0 || shortEntries.length > 0;

  // Check for overlaps with other entries
  const checkOverlap = (entryId: number, start: Date, end: Date | null): TimeEntry | null => {
    if (!end) return null;
    
    for (const entry of entries) {
      if (entry.id === entryId) continue;
      
      const entryStart = new Date(entry.start_time);
      const entryEnd = entry.end_time ? new Date(entry.end_time) : new Date();
      
      // Check if ranges overlap
      if (start < entryEnd && end > entryStart) {
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

  // Filter entries based on search, category, and date range
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Search filter (description and category name)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = entry.description?.toLowerCase().includes(query);
        const matchesCategory = entry.category_name.toLowerCase().includes(query);
        if (!matchesDescription && !matchesCategory) return false;
      }
      
      // Category filter
      if (categoryFilter !== 'all' && entry.category_id !== categoryFilter) {
        return false;
      }
      
      // Date range filter
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
  }, [entries, searchQuery, categoryFilter, dateFrom, dateTo]);

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
    } else { // month
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    
    setDateFrom(formatDateLocal(fromDate));
    setDateTo(formatDateLocal(today));
    setActivePreset(preset);
  };

  const handleSelect = (id: number) => {
    if (editingId !== id) {
      setEditingId(null);
      setEditField(null);
    }
    setSelected(id);
  };

  const startEdit = (entry: TimeEntry, field: EditField) => {
    setEditingId(entry.id);
    setEditField(field);
    setEditCategory(entry.category_id);
    setEditDescription(entry.description || '');
    setEditStartTime(formatDateTimeLocal(entry.start_time));
    setEditEndTime(entry.end_time ? formatDateTimeLocal(entry.end_time) : '');
  };

  const openManualEntry = () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setManualStartDate(formatDateOnly(oneHourAgo.toISOString()));
    setManualStartTime(formatTimeOnly(oneHourAgo.toISOString()));
    setManualEndDate(formatDateOnly(now.toISOString()));
    setManualEndTime(formatTimeOnly(now.toISOString()));
    setManualCategory('');
    setManualDescription('');
    setManualError('');
    setShowManualEntry(true);
  };

  const closeManualEntry = () => {
    setShowManualEntry(false);
    setManualError('');
  };

  const handleManualSubmit = async () => {
    if (!manualCategory) {
      setManualError('Please select a category');
      return;
    }
    if (!manualStartDate || !manualStartTime || !manualEndDate || !manualEndTime) {
      setManualError('Please set start and end date/time');
      return;
    }
    const start = combineDateAndTime(manualStartDate, manualStartTime);
    const end = combineDateAndTime(manualEndDate, manualEndTime);
    if (end <= start) {
      setManualError('End time must be after start time');
      return;
    }
    setIsSubmitting(true);
    setManualError('');
    try {
      await api.createManualEntry(manualCategory as number, start.toISOString(), end.toISOString(), manualDescription || undefined);
      closeManualEntry();
      handleEntryChangeInternal();
    } catch (error) {
      setManualError('Failed to create entry. Please try again.');
      console.error('Failed to create manual entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async (entryId: number) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    
    const newStart = editField === 'startTime' ? new Date(editStartTime).toISOString() : entry.start_time;
    const newEnd = editField === 'endTime' 
      ? (editEndTime ? new Date(editEndTime).toISOString() : null)
      : entry.end_time;

    try {
      await api.updateEntry(entryId, {
        category_id: editCategory,
        description: editDescription || null,
        start_time: newStart,
        end_time: newEnd
      });
      setEditingId(null);
      setEditField(null);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to update entry:', error);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, entryId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(entryId);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await api.deleteEntry(id);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const handleMergeEntries = async (candidate: MergeCandidate) => {
    const sorted = [...candidate.entries].sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    try {
      // Update the first entry to span the entire range
      await api.updateEntry(first.id, {
        category_id: first.category_id,
        description: first.description,
        start_time: first.start_time,
        end_time: last.end_time
      });
      
      // Delete the other entries
      for (let i = 1; i < sorted.length; i++) {
        await api.deleteEntry(sorted[i].id);
      }
      
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to merge entries:', error);
    }
  };

  const handleDismissMerge = (candidate: MergeCandidate) => {
    const key = candidate.entries.map(e => e.id).sort((a, b) => a - b).join('-');
    setDismissedMerges(prev => new Set([...prev, key]));
  };

  const handleDeleteShortEntry = async (entry: TimeEntry) => {
    try {
      await api.deleteEntry(entry.id);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const handleDismissShortEntry = (entryId: number) => {
    setDismissedShortEntries(prev => new Set([...prev, entryId]));
  };

  const handleDeleteDay = async (dateKey: string) => {
    const date = new Date(dateKey);
    const dateStr = date.toISOString().split('T')[0];
    const dayEntries = grouped[dateKey] || [];
    const completedCount = dayEntries.filter(e => e.end_time).length;
    
    if (completedCount === 0) {
      alert('No completed entries to delete for this day.');
      return;
    }
    
    if (!confirm(`Delete all ${completedCount} completed ${completedCount === 1 ? 'entry' : 'entries'} for ${formatDate(dayEntries[0].start_time)}?`)) {
      return;
    }
    
    try {
      await api.deleteEntriesByDate(dateStr);
      handleEntryChangeInternal();
    } catch (error) {
      console.error('Failed to delete entries:', error);
      alert('Failed to delete entries. Please try again.');
    }
  };

  const handleApplyAll = async () => {
    // Merge all candidates first
    for (const candidate of mergeCandidates) {
      await handleMergeEntries(candidate);
    }
    // Then delete all short entries
    for (const { entry } of shortEntries) {
      try {
        await api.deleteEntry(entry.id);
      } catch (error) {
        console.error('Failed to delete entry:', error);
      }
    }
    handleEntryChangeInternal();
  };

  const getTotalMinutes = () => {
    return filteredEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  };

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

  return (
    <div className="time-entry-list card">
      <div className="card-header">
        <h2 className="card-title">History</h2>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={openManualEntry}>+ Add Entry</button>
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

      {showManualEntry && (
        <div className="manual-entry-overlay" onClick={closeManualEntry}>
          <div className="manual-entry-modal" onClick={e => e.stopPropagation()}>
            <div className="manual-entry-header">
              <h3>Add Past Entry</h3>
              <button className="btn-icon" onClick={closeManualEntry}>×</button>
            </div>
            <div className="manual-entry-form">
              <div className="form-group">
                <label>Category</label>
                <select value={manualCategory} onChange={(e) => setManualCategory(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Description <span className="optional">(optional)</span></label>
                <input type="text" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="What were you working on?" />
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={manualStartDate} onChange={(e) => setManualStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={manualStartTime} onChange={(e) => setManualStartTime(e.target.value)} />
                </div>
              </div>
              <div className="form-row-datetime">
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" value={manualEndDate} onChange={(e) => setManualEndDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input type="time" value={manualEndTime} onChange={(e) => setManualEndTime(e.target.value)} />
                </div>
              </div>
              {manualError && <div className="manual-entry-error">{manualError}</div>}
              <div className="manual-entry-actions">
                <button className="btn btn-ghost" onClick={closeManualEntry}>Cancel</button>
                <button className="btn btn-primary" onClick={handleManualSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
                placeholder="Search descriptions & categories..."
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
      {showCleanupBanner && hasCleanupSuggestions && (
        <div className="cleanup-banner">
          <div className="cleanup-header">
            <span className="cleanup-icon">🧹</span>
            <span className="cleanup-title">Cleanup Suggestions</span>
            <button className="btn btn-sm btn-primary cleanup-apply-all" onClick={handleApplyAll}>
              Apply All
            </button>
            <button className="btn-icon cleanup-close" onClick={() => setShowCleanupBanner(false)}>×</button>
          </div>
          
          {mergeCandidates.map((candidate, idx) => {
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
                  <button className="btn btn-sm btn-primary" onClick={() => handleMergeEntries(candidate)}>Merge</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => handleDismissMerge(candidate)}>Dismiss</button>
                </div>
              </div>
            );
          })}
          
          {shortEntries.map(({ entry, durationSeconds }) => (
            <div key={entry.id} className="cleanup-item">
              <div className="cleanup-item-info">
                <span className="cleanup-item-icon">⏱️</span>
                <span className="cleanup-item-text">
                  Short entry: "{entry.category_name}"
                  {entry.description && <span className="cleanup-description"> ({entry.description})</span>}
                  <span className="cleanup-duration"> — {durationSeconds}s</span>
                </span>
              </div>
              <div className="cleanup-item-actions">
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteShortEntry(entry)}>Delete</button>
                <button className="btn btn-sm btn-ghost" onClick={() => handleDismissShortEntry(entry.id)}>Keep</button>
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
              <div className="entries">
                {dateEntries.map(entry => {
                  const isEditing = editingId === entry.id;
                  const isSelected = selected === entry.id;
                  const hasOverlap = overlaps[entry.id];
                  
                  return (
                    <div 
                      key={entry.id} 
                      className={`entry-item ${isSelected ? 'selected' : ''} ${hasOverlap ? 'has-overlap' : ''}`}
                      onClick={() => handleSelect(entry.id)}
                    >
                      <div 
                        className="entry-indicator" 
                        style={{ backgroundColor: isEditing 
                          ? categories.find(c => c.id === editCategory)?.color || '#6366f1'
                          : entry.category_color || '#6366f1' 
                        }}
                      />
                      <div className="entry-content">
                        <div className="entry-main">
                          {isEditing && editField === 'category' ? (
                            <select
                              className="inline-edit-select"
                              value={editCategory}
                              onChange={(e) => setEditCategory(Number(e.target.value))}
                              onBlur={() => handleSave(entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            >
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span 
                              className="entry-category editable"
                              onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry, 'category'); }}
                            >
                              {entry.category_name}
                            </span>
                          )}
                          {isEditing && editField === 'description' ? (
                            <input
                              type="text"
                              className="inline-edit-input"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              onBlur={() => handleSave(entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              placeholder="Add a description..."
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span 
                              className="entry-description editable"
                              onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry, 'description'); }}
                            >
                              {entry.description || '—'}
                            </span>
                          )}
                        </div>
                        <div className="entry-meta">
                          {isEditing && editField === 'startTime' ? (
                            <input
                              type="datetime-local"
                              className="inline-edit-time"
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              onBlur={() => handleSave(entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span 
                              className="entry-time editable"
                              onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry, 'startTime'); }}
                              title="Double-click to edit start time"
                            >
                              {formatTime(entry.start_time)}
                            </span>
                          )}
                          <span className="time-separator">–</span>
                          {isEditing && editField === 'endTime' ? (
                            <input
                              type="datetime-local"
                              className="inline-edit-time"
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              onBlur={() => handleSave(entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span 
                              className={`entry-time editable ${!entry.end_time ? 'active-time' : ''}`}
                              onDoubleClick={(e) => { 
                                if (entry.end_time) {
                                  e.stopPropagation(); 
                                  startEdit(entry, 'endTime'); 
                                }
                              }}
                              title={entry.end_time ? "Double-click to edit end time" : "Currently tracking"}
                            >
                              {entry.end_time ? formatTime(entry.end_time) : 'now'}
                            </span>
                          )}
                          <span className={`entry-duration ${!entry.end_time ? 'active' : ''}`}>
                            {formatDuration(entry.duration_minutes)}
                          </span>
                        </div>
                      </div>
                      {hasOverlap && (
                        <span className="overlap-warning" title={`Overlaps with: ${hasOverlap.category_name}`}>
                          ⚠️
                        </span>
                      )}
                      <button 
                        className="btn-icon delete-btn" 
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
