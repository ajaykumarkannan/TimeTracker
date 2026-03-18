import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import { useTheme } from '../contexts/ThemeContext';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';
import { fuzzyMatch } from '../utils/fuzzyMatch';
import './TimeTracker.css';

// Primary color palette - visually distinct colors
const COLOR_PALETTE = [
  '#6366f1', // Indigo (primary)
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#a855f7', // Purple
  '#eab308', // Yellow
];

function getNextAvailableColor(usedColors: (string | null)[]): string {
  const normalizedUsed = new Set(usedColors.map(c => c?.toLowerCase()));
  for (const color of COLOR_PALETTE) {
    if (!normalizedUsed.has(color.toLowerCase())) {
      return color;
    }
  }
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

// Format remaining time for scheduled stop display
function formatRemainingTime(scheduledEndTime: string): string {
  const remaining = new Date(scheduledEndTime).getTime() - Date.now();
  if (remaining <= 0) return 'now';
  
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  entries: TimeEntry[];
  onEntryChange: (optimistic?: { active?: TimeEntry | null; stopped?: TimeEntry }) => void;
  onCategoryChange: () => void;
}

interface RecentTask {
  task_name: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string | null;
  count: number;
  dayOfWeekCount: number; // Count for current day of week
}

export function TimeTracker({ categories, activeEntry, entries, onEntryChange, onCategoryChange }: Props) {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';

  const nextColor = useMemo(() => {
    const usedColors = categories.map(c => c.color);
    return getNextAvailableColor(usedColors);
  }, [categories]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(nextColor);
  
  // Cached suggestions - fetched once, filtered locally
  const [cachedSuggestions, setCachedSuggestions] = useState<{ task_name: string; categoryId: number; count: number; totalMinutes: number; lastUsed: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suppressSuggestionOpenRef = useRef(false);

  // Forgotten timer state (8+ hours)
  const [showForgottenPrompt, setShowForgottenPrompt] = useState(false);
  const [forgottenEndTime, setForgottenEndTime] = useState('');
  const forgottenDismissedRef = useRef(false);

  // Stop-in-progress state for optimistic UI
  const [stopping, setStopping] = useState(false);

  // Scheduled stop state
  const [showScheduleStopModal, setShowScheduleStopModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'duration' | 'time'>('duration');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [stopAtTime, setStopAtTime] = useState('');
  const [stopAtDate, setStopAtDate] = useState('');
  const [scheduledRemaining, setScheduledRemaining] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Fetch all suggestions once and cache them
  useEffect(() => {
    const fetchAllSuggestions = async () => {
      try {
        const results = await api.getTaskNameSuggestions(undefined, undefined);
        setCachedSuggestions(results);
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      }
    };
    fetchAllSuggestions();
  }, [entries.length]); // Refetch when entries change

  // Filter suggestions locally with fuzzy matching
  // Prefer selected category but show all tasks
  const suggestions = useMemo(() => {
    let filtered = [...cachedSuggestions];
    
    // Fuzzy filter by task name if there's a description
    if (description) {
      filtered = filtered
        .map(s => ({ ...s, ...fuzzyMatch(description, s.task_name) }))
        .filter(s => s.match)
        .sort((a, b) => {
          // Prefer selected category
          if (selectedCategory) {
            const aInCategory = a.categoryId === selectedCategory ? 1 : 0;
            const bInCategory = b.categoryId === selectedCategory ? 1 : 0;
            if (aInCategory !== bInCategory) return bInCategory - aInCategory;
          }
          // Then by match score, then by recency
          return b.score - a.score || new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        });
    } else {
      // No query - sort by category preference, then recency
      filtered = filtered.sort((a, b) => {
        if (selectedCategory) {
          const aInCategory = a.categoryId === selectedCategory ? 1 : 0;
          const bInCategory = b.categoryId === selectedCategory ? 1 : 0;
          if (aInCategory !== bInCategory) return bInCategory - aInCategory;
        }
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      });
    }
    
    return filtered.slice(0, 8);
  }, [cachedSuggestions, selectedCategory, description]);

  // Show/hide suggestions based on filtered results
  useEffect(() => {
    if (suggestions.length > 0 && (selectedCategory || description) && !suppressSuggestionOpenRef.current) {
      setShowSuggestions(true);
    } else if (suggestions.length === 0) {
      setShowSuggestions(false);
    }
    setSelectedSuggestionIndex(-1);
  }, [suggestions, selectedCategory, description]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(e.target as Node) &&
        descriptionInputRef.current &&
        !descriptionInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionSelect = (suggestion: { task_name: string; categoryId: number }) => {
    suppressSuggestionOpenRef.current = true;
    setDescription(suggestion.task_name);
    setSelectedCategory(suggestion.categoryId);
    setShowSuggestions(false);
    descriptionInputRef.current?.focus();
  };

  // Get recent tasks from entries (unique task_name + category combinations)
  // Prioritizes tasks commonly done on the current day of the week
  const recentTasks = useMemo((): RecentTask[] => {
    const taskMap = new Map<string, RecentTask>();
    const currentDayOfWeek = new Date().getDay(); // 0 = Sunday, 6 = Saturday

    entries
      .filter((e): e is TimeEntry & { task_name: string } => Boolean(e.task_name && e.task_name.trim()))
      .forEach(entry => {
        const key = `${entry.category_id}:${entry.task_name}`;
        const entryDayOfWeek = new Date(entry.start_time).getDay();
        const isCurrentDayOfWeek = entryDayOfWeek === currentDayOfWeek;
        
        const existing = taskMap.get(key);
        if (existing) {
          existing.count++;
          if (isCurrentDayOfWeek) {
            existing.dayOfWeekCount++;
          }
        } else {
          taskMap.set(key, {
            task_name: entry.task_name,
            categoryId: entry.category_id,
            categoryName: entry.category_name,
            categoryColor: entry.category_color,
            count: 1,
            dayOfWeekCount: isCurrentDayOfWeek ? 1 : 0
          });
        }
      });
    
    // Sort by: day-of-week relevance (weighted heavily), then total count
    // This prioritizes recurring meetings/tasks for the current day
    return Array.from(taskMap.values())
      .sort((a, b) => {
        // Weight day-of-week count heavily (multiply by 5) to prioritize recurring tasks
        const aScore = a.dayOfWeekCount * 5 + a.count;
        const bScore = b.dayOfWeekCount * 5 + b.count;
        return bScore - aScore;
      })
      .slice(0, 8);
  }, [entries]);

  // Measure how many recent task buttons fit in one row
  const recentTasksRef = useRef<HTMLDivElement>(null);

  const measureVisibleChildren = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    // Temporarily show all children for measurement
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;
    children.forEach(c => { c.style.display = ''; });

    const containerRight = container.getBoundingClientRect().right;
    let count = 0;
    for (const child of children) {
      const childRight = child.getBoundingClientRect().right;
      if (childRight > containerRight + 1) break;
      count++;
    }

    // Re-hide overflow children
    const visible = Math.max(count, 1);
    children.forEach((c, i) => {
      c.style.display = i >= visible ? 'none' : '';
    });
  }, []);

  useEffect(() => {
    const el = recentTasksRef.current;
    if (!el) return;

    const measure = () => measureVisibleChildren(el);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [recentTasks, activeEntry, measureVisibleChildren]);

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      forgottenDismissedRef.current = false;
      setShowForgottenPrompt(false);
      setForgottenEndTime('');
      return;
    }

    const updateElapsed = () => {
      const start = new Date(activeEntry.start_time).getTime();
      const now = Date.now();
      const elapsedSecs = Math.floor((now - start) / 1000);
      setElapsed(elapsedSecs);

      // Check for forgotten timer (8+ hours = 28800 seconds)
      if (elapsedSecs >= 28800 && !forgottenDismissedRef.current && !activeEntry.scheduled_end_time) {
        setShowForgottenPrompt(true);
        // Default end time to start date at 17:00 (end of typical workday)
        // Use functional update to only set the default when currently empty,
        // without needing forgottenEndTime in the closure (which would go stale).
        setForgottenEndTime(prev => {
          if (prev) return prev; // User already set a value — don't overwrite
          const startDate = new Date(activeEntry.start_time);
          const defaultEnd = new Date(startDate);
          // Default end time to 1 hour past the start of the entry
          defaultEnd.setTime(startDate.getTime() + 1 * 3600000);
          // Cap to now
          if (defaultEnd.getTime() > now) {
            defaultEnd.setTime(now);
          }
          const pad = (n: number) => n.toString().padStart(2, '0');
          return `${defaultEnd.getFullYear()}-${pad(defaultEnd.getMonth() + 1)}-${pad(defaultEnd.getDate())}T${pad(defaultEnd.getHours())}:${pad(defaultEnd.getMinutes())}`;
        });
      } else if (elapsedSecs < 28800 || activeEntry.scheduled_end_time) {
        // Dismiss prompt if elapsed dropped below 8h or a scheduled stop was set
        setShowForgottenPrompt(false);
        setForgottenEndTime('');
      }
      
      // Update scheduled remaining time display
      if (activeEntry.scheduled_end_time) {
        const remaining = new Date(activeEntry.scheduled_end_time).getTime() - now;
        if (remaining <= 0) {
          // Time to auto-stop - trigger stop and refresh
          api.stopEntry(activeEntry.id).then((stopped) => {
            onEntryChange({ active: null, stopped });
          }).catch(console.error);
          setScheduledRemaining(null);
        } else {
          setScheduledRemaining(formatRemainingTime(activeEntry.scheduled_end_time));
        }
      } else {
        setScheduledRemaining(null);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeEntry, onEntryChange]);

  const handleStop = async () => {
    if (!activeEntry || stopping) return;
    setStopping(true);
    // Optimistic UI: immediately clear the active entry so the timer stops visually
    onEntryChange({ active: null });
    try {
      const stopped = await api.stopEntry(activeEntry.id);
      onEntryChange({ active: null, stopped });
    } catch (error) {
      // Rollback: restore the active entry if the request failed
      onEntryChange({ active: activeEntry });
      console.error('Failed to stop entry:', error);
    } finally {
      setStopping(false);
    }
  };

  const handleForgottenKeep = () => {
    forgottenDismissedRef.current = true;
    setShowForgottenPrompt(false);
  };

  const handleForgottenSetEndTime = async () => {
    if (!activeEntry || !forgottenEndTime) return;
    try {
      await api.updateEntry(activeEntry.id, { end_time: forgottenEndTime });
      const stopped = await api.stopEntry(activeEntry.id);
      setShowForgottenPrompt(false);
      setForgottenEndTime('');
      forgottenDismissedRef.current = true;
      onEntryChange({ active: null, stopped });
    } catch (error) {
      console.error('Failed to set end time:', error);
    }
  };

  const handleOpenScheduleStop = () => {
    // Reset form state
    setDurationHours('');
    setDurationMinutes('');
    setScheduleError(null);
    // Default to current time
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    setStopAtTime(`${hours}:${minutes}`);
    setScheduleMode('duration');
    setShowScheduleStopModal(true);
  };

  // Generate quick time options based on current time
  const getQuickTimeOptions = () => {
    const now = new Date();
    const options: { label: string; time: string }[] = [];
    
    // Round up to next 30-minute mark
    const currentMinutes = now.getMinutes();
    const roundedMinutes = currentMinutes < 30 ? 30 : 0;
    const roundedHours = currentMinutes < 30 ? now.getHours() : now.getHours() + 1;
    
    const baseTime = new Date();
    baseTime.setHours(roundedHours, roundedMinutes, 0, 0);
    
    // Generate 3 options: next 30min mark, +30min, +1h from first
    for (let i = 0; i < 3; i++) {
      const optionTime = new Date(baseTime.getTime() + i * 30 * 60000);
      const h = optionTime.getHours();
      const m = optionTime.getMinutes();
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      
      // Format label as 12-hour time
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? 'am' : 'pm';
      const label = m === 0 ? `${hour12}${ampm}` : `${hour12}:${m.toString().padStart(2, '0')}${ampm}`;
      
      options.push({ label, time: timeStr });
    }
    
    return options;
  };

  const getTodayDateString = () => {
    const now = new Date();
    const localMidnight = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localMidnight.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (showScheduleStopModal && scheduleMode === 'time' && !stopAtDate) {
      setStopAtDate(getTodayDateString());
    }
  }, [showScheduleStopModal, scheduleMode, stopAtDate]);

  const handleScheduleStop = async () => {
    if (!activeEntry) return;
    
    let scheduledEndTime: Date;
    
    if (scheduleMode === 'duration') {
      const hours = parseInt(durationHours) || 0;
      const minutes = parseInt(durationMinutes) || 0;
      if (hours === 0 && minutes === 0) return;
      
      scheduledEndTime = new Date(Date.now() + (hours * 60 + minutes) * 60000);
    } else {
      if (!stopAtTime) return;

      const targetDate = stopAtDate || getTodayDateString();
      const [hours, minutes] = stopAtTime.split(':').map(Number);
      scheduledEndTime = new Date(`${targetDate}T00:00:00`);
      scheduledEndTime.setHours(hours, minutes, 0, 0);
    }
    
    // Validate: must be after entry start time
    const entryStartTime = new Date(activeEntry.start_time).getTime();
    if (scheduledEndTime.getTime() <= entryStartTime) {
      setScheduleError('Stop time must be after the entry start time');
      return;
    }
    
    try {
      const result = await api.scheduleStop(activeEntry.id, scheduledEndTime.toISOString());
      setShowScheduleStopModal(false);
      setScheduleError(null);
      // If the server stopped the entry immediately (past time), result will have end_time
      if (result.end_time) {
        onEntryChange({ active: null, stopped: result });
      } else {
        const updated = await api.getActiveEntry();
        onEntryChange({ active: updated });
      }
    } catch (error) {
      console.error('Failed to schedule stop:', error);
    }
  };

  const handleClearScheduledStop = async () => {
    if (!activeEntry) return;
    try {
      const updated = await api.clearScheduledStop(activeEntry.id);
      onEntryChange({ active: updated });
    } catch (error) {
      console.error('Failed to clear scheduled stop:', error);
    }
  };

  const handleSwitchTask = async (categoryId: number, taskDescription?: string) => {
    try {
      const entry = await api.startEntry(categoryId, taskDescription);
      setDescription('');
      setSelectedCategory(null);
      onEntryChange({ active: entry });
    } catch (error) {
      console.error('Failed to switch task:', error);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const category = await api.createCategory(newCategoryName, newCategoryColor);
      setSelectedCategory(category.id);
      setNewCategoryName('');
      setNewCategoryColor(nextColor);
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


  // Helper to get adaptive colors for a category
  const getCategoryColors = (color: string | null) => getAdaptiveCategoryColors(color, isDarkMode);

  return (
    <div className="time-tracker card">
      {/* Row 1: Timer — always visible */}
      <div className="active-tracker">
        <div className="timer-display">
          <div className={`timer-time ${!activeEntry ? 'timer-idle' : ''}`}>{formatTime(activeEntry ? elapsed : 0)}</div>
          <div className="timer-info">
            {activeEntry ? (() => {
              const colors = getCategoryColors(activeEntry.category_color);
              return (
                <span 
                  className="category-badge" 
                  style={{ 
                    backgroundColor: colors.bgColor,
                    color: colors.textColor
                  }}
                >
                  <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                  {activeEntry.category_name}
                </span>
              );
            })() : (
              <span className="category-badge category-badge-idle">
              <span className="category-dot" style={{ backgroundColor: 'var(--text-muted)' }} />
              No task
            </span>
            )}
            {activeEntry?.task_name && <span className="timer-description">{activeEntry.task_name}</span>}
          </div>
        </div>
        <div className="timer-actions">
          <div className={`stop-button-group ${activeEntry?.scheduled_end_time ? 'has-schedule' : ''}`}>
            <button className="btn btn-danger stop-main" onClick={handleStop} disabled={!activeEntry || stopping}>
              <span className="stop-icon">■</span>
              {activeEntry?.scheduled_end_time ? null : (stopping ? 'Stopping…' : 'Stop')}
            </button>
            {activeEntry?.scheduled_end_time ? (
              <button 
                className="btn btn-danger btn-end-at scheduled" 
                onClick={handleClearScheduledStop}
                title="Click to cancel scheduled end"
              >
                <svg className="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span className="scheduled-time">{scheduledRemaining}</span>
              </button>
            ) : (
              <button 
                className="btn btn-danger btn-end-at" 
                onClick={handleOpenScheduleStop}
                title="Schedule end time"
                disabled={!activeEntry}
              >
                <svg className="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Schedule stop modal */}
      {showScheduleStopModal && (
            <div className="task-prompt-overlay" onClick={() => setShowScheduleStopModal(false)}>
              <div className="task-prompt-modal schedule-stop-modal" onClick={e => e.stopPropagation()}>
                <div className="task-prompt-header">
                  <span className="task-prompt-title">Set Stop Time</span>
                </div>
                
                <div className="schedule-mode-tabs">
                  <button 
                    className={`schedule-mode-tab ${scheduleMode === 'duration' ? 'active' : ''}`}
                    onClick={() => setScheduleMode('duration')}
                  >
                    After duration
                  </button>
                  <button 
                    className={`schedule-mode-tab ${scheduleMode === 'time' ? 'active' : ''}`}
                    onClick={() => setScheduleMode('time')}
                  >
                    At specific time
                  </button>
                </div>
                
                {scheduleMode === 'duration' ? (
                  <div className="schedule-duration-inputs">
                    <div className="duration-input-group">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={durationHours}
                        onChange={(e) => setDurationHours(e.target.value)}
                        placeholder="0"
                        className="duration-input"
                        autoFocus
                      />
                      <span className="duration-label">hours</span>
                    </div>
                    <div className="duration-input-group">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        placeholder="0"
                        className="duration-input"
                      />
                      <span className="duration-label">minutes</span>
                    </div>
                  </div>
                ) : (
                  <div className="schedule-time-input">
                    <input
                      type="date"
                      value={stopAtDate || getTodayDateString()}
                      onChange={(e) => setStopAtDate(e.target.value)}
                      className="date-input"
                    />
                    <input
                      type="time"
                      value={stopAtTime}
                      onChange={(e) => setStopAtTime(e.target.value)}
                      className="time-input"
                      autoFocus
                    />
                  </div>
                )}
                
                <div className="schedule-quick-options">
                  <span className="quick-options-label">Quick:</span>
                  {scheduleMode === 'duration' ? (
                    // Duration quick options: 5m, 10m, 15m, 30m, 1h
                    [5, 10, 15, 30, 60].map(mins => (
                      <button
                        key={mins}
                        className="quick-duration-btn"
                        onClick={() => {
                          setDurationHours(Math.floor(mins / 60).toString());
                          setDurationMinutes((mins % 60).toString());
                        }}
                      >
                        {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                      </button>
                    ))
                  ) : (
                    // Time quick options: next rounded times
                    getQuickTimeOptions().map(opt => (
                      <button
                        key={opt.time}
                        className="quick-duration-btn"
                        onClick={() => setStopAtTime(opt.time)}
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
                
                <div className="task-prompt-actions">
                  {scheduleError && (
                    <div className="schedule-error">{scheduleError}</div>
                  )}
                  <button className="btn btn-ghost" onClick={() => { setShowScheduleStopModal(false); setScheduleError(null); }}>
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleScheduleStop}
                    disabled={scheduleMode === 'duration' 
                      ? (!durationHours && !durationMinutes) || (parseInt(durationHours || '0') === 0 && parseInt(durationMinutes || '0') === 0)
                      : !stopAtTime
                    }
                  >
                    <span className="schedule-icon">⏱</span>
                    Set Stop Time
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Forgotten timer prompt (8+ hours) */}
      {showForgottenPrompt && activeEntry && (
        <div className="forgotten-timer-banner">
          <div className="forgotten-timer-message">
            <span className="forgotten-timer-icon">⏰</span>
            <span>This timer has been running for over 8 hours. Did you forget to stop it?</span>
          </div>
          <div className="forgotten-timer-actions">
            <button className="btn btn-ghost" onClick={handleForgottenKeep}>
              Keep all time
            </button>
            <div className="forgotten-timer-end-time">
              <input
                type="datetime-local"
                value={forgottenEndTime}
                onChange={(e) => setForgottenEndTime(e.target.value)}
                className="forgotten-time-input"
                max={new Date().toISOString().slice(0, 16)}
                min={activeEntry.start_time ? new Date(activeEntry.start_time).toISOString().slice(0, 16) : undefined}
              />
              <button
                className="btn btn-primary"
                onClick={handleForgottenSetEndTime}
                disabled={!forgottenEndTime}
              >
                Set end time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Switch to — recent task buttons */}
      <div className="switch-task-section">
        <div className="switch-task-row">
          <span className="switch-label">Switch to:</span>
          <div className="switch-quick-options" ref={recentTasksRef}>
            {recentTasks.map((task, idx) => {
              const colors = getCategoryColors(task.categoryColor);
              return (
                <button
                  key={idx}
                  className="switch-task-btn"
                  onClick={() => handleSwitchTask(task.categoryId, task.task_name)}
                  title={task.categoryName}
                >
                  <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                  <span className="switch-task-description">{task.task_name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: New task form — always visible */}
        <div className="new-task-inline">
          {(() => {
            const selectedCat = categories.find(c => c.id === selectedCategory);
            const colors = selectedCat ? getCategoryColors(selectedCat.color) : null;
            return (
              <div 
                className="new-task-category-wrapper"
                style={colors ? { 
                  '--cat-bg': colors.bgColor, 
                  '--cat-dot': colors.dotColor,
                  '--cat-text': colors.textColor
                } as React.CSSProperties : undefined}
              >
                <span className="category-color-indicator" style={{ backgroundColor: colors?.dotColor || 'var(--text-muted)' }} />
                <select 
                  className="switch-category-select"
                  value={selectedCategory || ''} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'new') {
                      setShowNewCategory(true);
                      setSelectedCategory(null);
                    } else {
                      suppressSuggestionOpenRef.current = false;
                      setSelectedCategory(Number(val));
                      setShowNewCategory(false);
                    }
                  }}
                >
                  <option value="">Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="new">+ New category</option>
                </select>
              </div>
            );
          })()}
          <div className="description-input-wrapper switch-description-wrapper">
            <input 
              ref={descriptionInputRef}
              type="text"
              className="switch-description-input"
              value={description}
              onChange={(e) => {
                suppressSuggestionOpenRef.current = false;
                setDescription(e.target.value);
              }}
              placeholder="Task (optional)"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              onFocus={() => {
                if (suggestions.length > 0 && !suppressSuggestionOpenRef.current) {
                  setShowSuggestions(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (showSuggestions) {
                    suppressSuggestionOpenRef.current = true;
                    setShowSuggestions(false);
                    setSelectedSuggestionIndex(-1);
                  }
                  return;
                }
                if (!showSuggestions || suggestions.length === 0) {
                  if (e.key === 'Enter' && selectedCategory) {
                    handleSwitchTask(selectedCategory, description || undefined);
                  }
                  return;
                }
                switch (e.key) {
                  case 'ArrowDown':
                    e.preventDefault();
                    setSelectedSuggestionIndex(prev => 
                      prev < suggestions.length - 1 ? prev + 1 : prev
                    );
                    break;
                  case 'ArrowUp':
                    e.preventDefault();
                    setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
                    break;
                  case 'Enter':
                    e.preventDefault();
                    if (selectedSuggestionIndex >= 0) {
                      handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
                    } else if (selectedCategory) {
                      handleSwitchTask(selectedCategory, description || undefined);
                    }
                    break;
                }
              }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="description-suggestions" ref={suggestionsRef}>
                {suggestions.map((suggestion, idx) => {
                  const cat = categories.find(c => c.id === suggestion.categoryId);
                  const colors = getCategoryColors(cat?.color || null);
                  return (
                    <button
                      key={`${suggestion.categoryId}-${suggestion.task_name}`}
                      className={`suggestion-item ${idx === selectedSuggestionIndex ? 'selected' : ''}`}
                      onClick={() => handleSuggestionSelect(suggestion)}
                      onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                    >
                      <span className="suggestion-text">{suggestion.task_name}</span>
                      <span className="suggestion-meta">
                        <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                        <span className="suggestion-category">{cat?.name || 'Unknown'}</span>
                        <span className="suggestion-count">×{suggestion.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button 
            className="btn btn-success start-btn"
            onClick={() => selectedCategory && handleSwitchTask(selectedCategory, description || undefined)}
            disabled={!selectedCategory}
          >
            <span className="play-icon">▶</span>
            <span className="start-btn-text">Start</span>
          </button>
        </div>
      </div>

      {/* New category modal (shared by start form and switch task inline) */}
      {showNewCategory && (
        <div className="task-prompt-overlay" onClick={() => setShowNewCategory(false)}>
          <div className="task-prompt-modal" onClick={e => e.stopPropagation()}>
            <div className="task-prompt-header">
              <span className="task-prompt-title">New Category</span>
            </div>
            <div className="new-category-modal-form">
              <div className="new-category-input-row">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategoryName.trim()) handleCreateCategory();
                    if (e.key === 'Escape') setShowNewCategory(false);
                  }}
                />
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="color-picker"
                />
              </div>
              <div className="new-category-modal-actions">
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
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
