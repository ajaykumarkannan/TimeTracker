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
  const [newCategoryColor, setNewCategoryColor] = useState('#007aff');
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

  // Get unique notes for autocomplete
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
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="time-tracker card">
      {activeEntry ? (
        <div className="active-tracker">
          <div className="timer-display">
            <div className="timer-time">{formatTime(elapsed)}</div>
            <div className="timer-category">
              <span 
                className="category-dot" 
                style={{ backgroundColor: activeEntry.category_color || '#007aff' }}
              />
              {activeEntry.category_name}
            </div>
            {activeEntry.note && <div className="timer-note">{activeEntry.note}</div>}
          </div>
          <button className="btn-danger" onClick={handleStop}>
            Stop Timer
          </button>
        </div>
      ) : (
        <div className="start-tracker">
          <div className="tracker-form">
            <div className="form-group">
              <label>Category</label>
              <div className="category-select-wrapper">
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
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="new">+ Create new category</option>
                </select>
              </div>
            </div>

            {showNewCategory && (
              <div className="new-category-form">
                <div className="new-category-inputs">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    autoFocus
                  />
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="color-picker"
                  />
                </div>
                <div className="new-category-actions">
                  <button className="btn-secondary" onClick={() => setShowNewCategory(false)}>
                    Cancel
                  </button>
                  <button 
                    className="btn-primary" 
                    onClick={handleCreateCategory}
                    disabled={!newCategoryName.trim()}
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
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
                  placeholder="What are you working on?"
                />
                {showSuggestions && (
                  <div className="suggestions-dropdown">
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
              className="btn-success start-button" 
              onClick={handleStart}
              disabled={!selectedCategory}
            >
              Start Timer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
