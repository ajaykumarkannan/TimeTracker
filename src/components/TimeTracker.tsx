import { useState, useEffect } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import './TimeTracker.css';

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  onEntryChange: () => void;
  onCategoryChange: () => void;
}

export function TimeTracker({ categories, activeEntry, onEntryChange, onCategoryChange }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [pausedEntry, setPausedEntry] = useState<TimeEntry | null>(null);

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
      onEntryChange();
    } catch (error) {
      console.error('Failed to start entry:', error);
    }
  };

  const handleStop = async () => {
    if (!activeEntry) return;
    try {
      await api.stopEntry(activeEntry.id);
      setPausedEntry(null);
      onEntryChange();
    } catch (error) {
      console.error('Failed to stop entry:', error);
    }
  };

  const handlePause = async () => {
    if (!activeEntry) return;
    try {
      await api.stopEntry(activeEntry.id);
      setPausedEntry({ ...activeEntry, end_time: new Date().toISOString() });
      onEntryChange();
    } catch (error) {
      console.error('Failed to pause entry:', error);
    }
  };

  const handleResume = async () => {
    if (!pausedEntry) return;
    try {
      await api.startEntry(pausedEntry.category_id, pausedEntry.note || undefined);
      setPausedEntry(null);
      onEntryChange();
    } catch (error) {
      console.error('Failed to resume entry:', error);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const category = await api.createCategory(newCategoryName, newCategoryColor);
      setSelectedCategory(category.id);
      setNewCategoryName('');
      setNewCategoryColor('#6366f1');
      setShowNewCategory(false);
      onCategoryChange();
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return (
      <span className="timer-digits">
        <span className="digit-group">{h.toString().padStart(2, '0')}</span>
        <span className="digit-separator">:</span>
        <span className="digit-group">{m.toString().padStart(2, '0')}</span>
        <span className="digit-separator">:</span>
        <span className="digit-group">{s.toString().padStart(2, '0')}</span>
      </span>
    );
  };

  const recentCategories = categories.slice(0, 4);

  return (
    <div className="time-tracker card">
      {activeEntry ? (
        <div className="active-tracker">
          <div className="timer-display">
            <div className="timer-time">{formatTime(elapsed)}</div>
            <div className="timer-info">
              <span 
                className="category-badge" 
                style={{ 
                  backgroundColor: `${activeEntry.category_color}20`,
                  color: activeEntry.category_color || '#6366f1'
                }}
              >
                <span className="category-dot" style={{ backgroundColor: activeEntry.category_color || '#6366f1' }} />
                {activeEntry.category_name}
              </span>
              {activeEntry.note && <span className="timer-note">{activeEntry.note}</span>}
            </div>
          </div>
          <div className="timer-actions">
            <button className="btn btn-warning" onClick={handlePause} title="Pause">
              <span className="pause-icon">❚❚</span>
              Pause
            </button>
            <button className="btn btn-danger" onClick={handleStop}>
              <span className="stop-icon">■</span>
              Stop
            </button>
          </div>
        </div>
      ) : pausedEntry ? (
        <div className="paused-tracker">
          <div className="paused-info">
            <span className="paused-label">⏸ Paused</span>
            <span 
              className="category-badge" 
              style={{ 
                backgroundColor: `${pausedEntry.category_color}20`,
                color: pausedEntry.category_color || '#6366f1'
              }}
            >
              <span className="category-dot" style={{ backgroundColor: pausedEntry.category_color || '#6366f1' }} />
              {pausedEntry.category_name}
            </span>
            {pausedEntry.note && <span className="timer-note">{pausedEntry.note}</span>}
          </div>
          <div className="timer-actions">
            <button className="btn btn-success" onClick={handleResume}>
              <span className="play-icon">▶</span>
              Resume
            </button>
            <button className="btn btn-ghost" onClick={() => setPausedEntry(null)}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <div className="start-tracker">
          {recentCategories.length > 0 && (
            <div className="quick-start">
              <span className="quick-start-label">Quick start</span>
              <div className="quick-start-buttons">
                {recentCategories.map(cat => (
                  <button
                    key={cat.id}
                    className="quick-start-btn"
                    style={{ borderColor: cat.color || '#6366f1', color: cat.color || '#6366f1' }}
                    onClick={() => {
                      api.startEntry(cat.id).then(onEntryChange);
                    }}
                  >
                    <span className="category-dot" style={{ backgroundColor: cat.color || '#6366f1' }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tracker-form">
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select 
                  value={selectedCategory || ''} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'new') {
                      setShowNewCategory(true);
                      setSelectedCategory(null);
                    } else {
                      setSelectedCategory(Number(val));
                      setShowNewCategory(false);
                    }
                  }}
                >
                  <option value="">Select category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="new">+ New category</option>
                </select>
              </div>

              <div className="form-group form-group-note">
                <label>Note <span className="optional">(optional)</span></label>
                <input 
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && selectedCategory) {
                      handleStart();
                    }
                  }}
                  placeholder="What are you working on?"
                />
              </div>

              <div className="form-group form-group-action">
                <label>&nbsp;</label>
                <button 
                  className="btn btn-success start-btn" 
                  onClick={handleStart}
                  disabled={!selectedCategory}
                >
                  <span className="play-icon">▶</span>
                  Start
                </button>
              </div>
            </div>

            {showNewCategory && (
              <div className="new-category-form animate-slide-in">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory();
                    if (e.key === 'Escape') setShowNewCategory(false);
                  }}
                />
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="color-picker"
                />
                <button className="btn btn-ghost" onClick={() => setShowNewCategory(false)}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleCreateCategory}
                  disabled={!newCategoryName.trim()}
                >
                  Create
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
