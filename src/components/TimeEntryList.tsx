import { TimeEntry, Category } from '../types';
import { api } from '../api';
import './TimeEntryList.css';

interface Props {
  entries: TimeEntry[];
  categories: Category[];
  onUpdate: () => void;
}

export function TimeEntryList({ entries, categories, onUpdate }: Props) {
  const handleDelete = async (id: number) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await api.deleteEntry(id);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return 'In progress...';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const getTotalMinutes = () => {
    return entries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
  };

  const groupByDate = () => {
    const groups: { [key: string]: TimeEntry[] } = {};
    entries.forEach(entry => {
      const date = new Date(entry.start_time).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  };

  const grouped = groupByDate();
  const totalMinutes = getTotalMinutes();

  return (
    <div className="time-entry-list">
      <div className="list-header">
        <h2>Time Entries</h2>
        <div className="total-time">
          Total: {formatDuration(totalMinutes)}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="empty-state">No time entries yet. Start tracking to see your history!</p>
      ) : (
        <div className="entries-by-date">
          {Object.entries(grouped).map(([date, dateEntries]) => (
            <div key={date} className="date-group">
              <h3 className="date-header">{date}</h3>
              <div className="entries">
                {dateEntries.map(entry => (
                  <div key={entry.id} className="entry-item">
                    <div 
                      className="entry-color" 
                      style={{ backgroundColor: entry.category_color || '#ccc' }}
                    />
                    <div className="entry-content">
                      <div className="entry-main">
                        <span className="entry-category">{entry.category_name}</span>
                        <span className="entry-time">{formatDate(entry.start_time)}</span>
                      </div>
                      {entry.note && <div className="entry-note">{entry.note}</div>}
                    </div>
                    <div className="entry-duration">
                      {formatDuration(entry.duration_minutes)}
                    </div>
                    <button 
                      className="btn-delete" 
                      onClick={() => handleDelete(entry.id)}
                      title="Delete"
                    >
                      🗑️
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
