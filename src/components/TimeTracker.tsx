import { useState, useEffect, useRef } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import './TimeTracker.css';

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  entries: TimeEntry[];
  onUpdate: () => void;
}

export function TimeTracker({ categories, activeEntry, entries, onUpdate }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const noteInputRef = useRef<HTMLInputElement>(null);

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

  const getNoteSuggestions = (input: string) => {
    if (!input.trim()) return [];
    const uniqueNotes = [...new Set(
      entries
        .filter(e => e.note && e.note.toLowerCase().includes(input.toLowerCase()))
        .map(e => e.note!)
    )];
    return uniqueNotes.slice(0, 5);
  };

  const handleNoteChange = (value: string) => {
    setNote(value);
    const matches = getNoteSuggestions(value);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0 && value.length > 0);
  };

  const selectSuggestion = (suggestion: string) => {
    setNote(suggestion);
    setShowSuggestions(false);
  };

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

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const category = await api.createCategory(newCategoryName, newCategoryColor);
      setSelectedCategory(category.id);
      setNewCategoryName('');
      setShowNewCategory(false);
      onUpdate();
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

  // Quick start from recent categories
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
            <button className="btn btn-danger" onClick={handleStop}>
              <span className="stop-icon">■</span>
              Stop
            </button>
            <span className="kbd-hint">
              <span className="kbd">⌘</span>
              <span className="kbd">K</span>
            </span>
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
                    style={{ 
                      borderColor: cat.color || '#6366f1',
                      color: cat.color || '#6366f1'
                    }}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      api.startEntry(cat.id).then(onUpdate);
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
              <div className="form-group flex-1">
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

              <div className="form-group flex-2">
                <label>Note <span className="optional">(optional)</span></label>
                <div className="autocomplete-wrapper">
                  <input 
                    ref={noteInputRef}
                    type="text"
                    value={note}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && selectedCategory) {
                        handleStart();
                      }
                    }}
                    placeholder="What are you working on?"
                  />
                  {showSuggestions && (
                    <div className="suggestions-dropdown animate-slide-in">
                      {suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          className="suggestion-item"
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button 
                className="btn btn-success start-btn" 
                onClick={handleStart}
                disabled={!selectedCategory}
              >
                <span className="play-icon">▶</span>
                Start
              </button>
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
