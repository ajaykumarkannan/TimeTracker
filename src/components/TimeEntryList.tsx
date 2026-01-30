import { useState, useMemo } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import './TimeEntryList.css';

interface Props {
  entries: TimeEntry[];
  categories: Category[];
  onEntryChange: () => void;
}

type EditField = 'category' | 'note' | 'startTime' | 'endTime' | null;

export function TimeEntryList({ entries, categories, onEntryChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editField, setEditField] = useState<EditField>(null);
  const [editCategory, setEditCategory] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Manual entry form state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCategory, setManualCategory] = useState<number | ''>('');
  const [manualNote, setManualNote] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualError, setManualError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // Search filter (note and category name)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesNote = entry.note?.toLowerCase().includes(query);
        const matchesCategory = entry.category_name.toLowerCase().includes(query);
        if (!matchesNote && !matchesCategory) return false;
      }
      
      // Category filter
      if (categoryFilter !== 'all' && entry.category_id !== categoryFilter) {
        return false;
      }
      
      // Date range filter
      const entryDate = new Date(entry.start_time);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (entryDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
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
    setEditNote(entry.note || '');
    setEditStartTime(formatDateTimeLocal(entry.start_time));
    setEditEndTime(entry.end_time ? formatDateTimeLocal(entry.end_time) : '');
  };

  const formatDateTimeLocal = (dateStr: string) => {
    const date = new Date(dateStr);
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
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
        note: editNote || null,
        start_time: newStart,
        end_time: newEnd
      });
      setEditingId(null);
      setEditField(null);
      onEntryChange();
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
      onEntryChange();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return '—';
    if (minutes === 0) return '<1m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <div className="filter-group search-group">
              <input
                type="text"
                className="filter-input search-input"
                placeholder="Search notes & categories..."
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
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="filter-group date-group">
              <label className="filter-label">To</label>
              <input
                type="date"
                className="filter-input date-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
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

      {entries.length === 0 ? (
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
              <div className="date-header">{formatDate(dateEntries[0].start_time)}</div>
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
                          {isEditing && editField === 'note' ? (
                            <input
                              type="text"
                              className="inline-edit-input"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              onBlur={() => handleSave(entry.id)}
                              onKeyDown={(e) => handleKeyDown(e, entry.id)}
                              placeholder="Add a note..."
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span 
                              className="entry-note editable"
                              onDoubleClick={(e) => { e.stopPropagation(); startEdit(entry, 'note'); }}
                            >
                              {entry.note || '—'}
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
