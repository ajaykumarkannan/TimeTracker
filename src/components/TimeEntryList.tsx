import { useState } from 'react';
import { TimeEntry, Category } from '../types';
import { api } from '../api';
import './TimeEntryList.css';

interface Props {
  entries: TimeEntry[];
  categories: Category[];
  onUpdate: () => void;
}

interface EditState {
  id: number;
  category_id: number;
  note: string;
}

export function TimeEntryList({ entries, categories, onUpdate }: Props) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (entry: TimeEntry) => {
    setSelected(entry.id);
  };

  const handleEdit = (entry: TimeEntry) => {
    setEditing({
      id: entry.id,
      category_id: entry.category_id,
      note: entry.note || ''
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const entry = entries.find(e => e.id === editing.id);
      if (!entry) return;
      
      await api.updateEntry(editing.id, {
        category_id: editing.category_id,
        note: editing.note || null,
        start_time: entry.start_time,
        end_time: entry.end_time
      });
      setEditing(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to update entry:', error);
    }
  };

  const handleCancel = () => {
    setEditing(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await api.deleteEntry(id);
      onUpdate();
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
    return entries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  };

  const groupByDate = () => {
    const groups: { [key: string]: TimeEntry[] } = {};
    entries.forEach(entry => {
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
        <div className="total-badge">
          {formatDuration(totalMinutes)}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>No entries yet</p>
          <p className="empty-hint">Start tracking to build your history</p>
        </div>
      ) : (
        <div className="entries-by-date">
          {Object.entries(grouped).map(([dateKey, dateEntries]) => (
            <div key={dateKey} className="date-group">
              <div className="date-header">{formatDate(dateEntries[0].start_time)}</div>
              <div className="entries">
                {dateEntries.map(entry => (
                  <div key={entry.id} className={`entry-item ${editing?.id === entry.id ? 'editing' : ''}`}>
                    <div 
                      className="entry-indicator" 
                      style={{ backgroundColor: editing?.id === entry.id 
                        ? categories.find(c => c.id === editing.category_id)?.color || '#6366f1'
                        : entry.category_color || '#6366f1' 
                      }}
                    />
                    {editing?.id === entry.id ? (
                      <div className="entry-content entry-edit-form">
                        <div className="entry-edit-fields">
                          <select
                            className="edit-category-select"
                            value={editing.category_id}
                            onChange={(e) => setEditing({ ...editing, category_id: Number(e.target.value) })}
                          >
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            className="edit-note-input"
                            value={editing.note}
                            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                            onKeyDown={handleKeyDown}
                            placeholder="Add a note..."
                            autoFocus
                          />
                        </div>
                        <div className="entry-edit-actions">
                          <button className="btn-save" onClick={handleSave} title="Save (Enter)">✓</button>
                          <button className="btn-cancel" onClick={handleCancel} title="Cancel (Esc)">×</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="entry-content" onClick={() => handleEdit(entry)}>
                          <div className="entry-main">
                            <span className="entry-category">{entry.category_name}</span>
                            {entry.note && <span className="entry-note">{entry.note}</span>}
                          </div>
                          <div className="entry-meta">
                            <span className="entry-time">{formatTime(entry.start_time)}</span>
                            <span className={`entry-duration ${!entry.end_time ? 'active' : ''}`}>
                              {formatDuration(entry.duration_minutes)}
                            </span>
                          </div>
                        </div>
                        <button 
                          className="btn-icon edit-btn" 
                          onClick={() => handleEdit(entry)}
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button 
                          className="btn-icon delete-btn" 
                          onClick={() => handleDelete(entry.id)}
                          title="Delete"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
