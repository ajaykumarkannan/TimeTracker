import { TimeEntry, Category } from '../types';
import { api } from '../api';
import './TimeEntryList.css';

interface Props {
  entries: TimeEntry[];
  categories: Category[];
  onUpdate: () => void;
}

export function TimeEntryList({ entries, onUpdate }: Props) {
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
    if (!minutes) return 'In progress';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
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
          {formatDuration(totalMinutes)} total
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⏱️</div>
          <p>No time entries yet</p>
          <p className="empty-hint">Start tracking to see your history</p>
        </div>
      ) : (
        <div className="entries-by-date">
          {Object.entries(grouped).map(([dateKey, dateEntries]) => (
            <div key={dateKey} className="date-group">
              <div className="date-header">{formatDate(dateEntries[0].start_time)}</div>
              <div className="entries">
                {dateEntries.map(entry => (
                  <div key={entry.id} className="entry-item">
                    <div 
                      className="entry-indicator" 
                      style={{ backgroundColor: entry.category_color || '#007aff' }}
                    />
                    <div className="entry-content">
                      <div className="entry-main">
                        <span className="entry-category">{entry.category_name}</span>
                        {entry.note && <span className="entry-note">{entry.note}</span>}
                      </div>
                      <div className="entry-meta">
                        <span className="entry-time">{formatTime(entry.start_time)}</span>
                        <span className="entry-duration">{formatDuration(entry.duration_minutes)}</span>
                      </div>
                    </div>
                    <button 
                      className="btn-icon delete-btn" 
                      onClick={() => handleDelete(entry.id)}
                      title="Delete"
                    >
                      ×
                    </button>
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
