import { useState, useEffect } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import './TimeTracker.css';

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  onUpdate: () => void;
}

export function TimeTracker({ categories, activeEntry, onUpdate }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const start = new Date(activeEntry.start_time).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const handleStart = async () => {
    if (!selectedCategory) return;
    try {
      await api.startEntry(selectedCategory, note || undefined);
      setNote('');
      onUpdate();
    } catch (error) {
      console.error('Failed to start entry:', error);
    }
  };

  const handleStop = async () => {
    if (!activeEntry) return;
    try {
      await api.stopEntry(activeEntry.id);
      onUpdate();
    } catch (error) {
      console.error('Failed to stop entry:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="time-tracker">
      {activeEntry ? (
        <div className="active-tracker">
          <div className="timer-display">
            <div className="timer-time">{formatTime(elapsed)}</div>
            <div className="timer-category" style={{ color: activeEntry.category_color || '#333' }}>
              {activeEntry.category_name}
            </div>
            {activeEntry.note && <div className="timer-note">{activeEntry.note}</div>}
          </div>
          <button className="btn btn-stop" onClick={handleStop}>
            Stop Timer
          </button>
        </div>
      ) : (
        <div className="start-tracker">
          <h2>Start Tracking</h2>
          <div className="form-group">
            <label>Category</label>
            <select 
              value={selectedCategory || ''} 
              onChange={(e) => setSelectedCategory(Number(e.target.value))}
            >
              <option value="">Select a category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Note (optional)</label>
            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on?"
              rows={3}
            />
          </div>
          <button 
            className="btn btn-start" 
            onClick={handleStart}
            disabled={!selectedCategory}
          >
            Start Timer
          </button>
        </div>
      )}
    </div>
  );
}
