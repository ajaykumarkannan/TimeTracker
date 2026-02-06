import { useState, useEffect, useMemo, useRef } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import { useTheme } from '../contexts/ThemeContext';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';
import './TimeTracker.css';

// Simple fuzzy match - checks if all characters in query appear in order in target
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  if (!q) return { match: true, score: 1 };
  if (t.includes(q)) return { match: true, score: 2 }; // Exact substring match scores highest
  
  let qIdx = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;
  
  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      qIdx++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    } else {
      consecutiveMatches = 0;
    }
  }
  
  const match = qIdx === q.length;
  const score = match ? maxConsecutive / q.length : 0;
  return { match, score };
}

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
  onEntryChange: () => void;
  onCategoryChange: () => void;
}

interface RecentTask {
  task_name: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string | null;
  count: number;
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
  const [pausedEntry, setPausedEntry] = useState<TimeEntry | null>(null);
  const [taskNamePrompt, setTaskNamePrompt] = useState<{ categoryId: number; categoryName: string; categoryColor: string | null } | null>(null);
  const [promptedTaskName, setPromptedTaskName] = useState('');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [switchTaskPrompt, setSwitchTaskPrompt] = useState<{ categoryId: number; categoryName: string; categoryColor: string | null } | null>(null);
  const [switchTaskName, setSwitchTaskName] = useState('');
  
  // Cached suggestions - fetched once, filtered locally
  const [cachedSuggestions, setCachedSuggestions] = useState<{ task_name: string; categoryId: number; count: number; totalMinutes: number; lastUsed: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suppressSuggestionOpenRef = useRef(false);
  
  // Modal suggestions state
  const [showModalSuggestions, setShowModalSuggestions] = useState(false);
  const [selectedModalSuggestionIndex, setSelectedModalSuggestionIndex] = useState(-1);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const modalSuggestionsRef = useRef<HTMLDivElement>(null);
  const suppressModalSuggestionOpenRef = useRef(false);

  // Scheduled stop state
  const [showScheduleStopModal, setShowScheduleStopModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'duration' | 'time'>('duration');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [stopAtTime, setStopAtTime] = useState('');
  const [scheduledRemaining, setScheduledRemaining] = useState<string | null>(null);

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

  // Filter modal suggestions (for task/switch prompts)
  // For new task: show all tasks sorted by recency
  // For switch task: prefer current category, then show others sorted by recency
  const modalSuggestions = useMemo(() => {
    const query = taskNamePrompt ? promptedTaskName : (switchTaskPrompt ? switchTaskName : '');
    const currentCategoryId = switchTaskPrompt?.categoryId;
    
    if (!taskNamePrompt && !switchTaskPrompt) return [];
    
    let filtered = [...cachedSuggestions];
    
    if (query) {
      filtered = filtered
        .map(s => ({ ...s, ...fuzzyMatch(query, s.task_name) }))
        .filter(s => s.match)
        .sort((a, b) => {
          // For switch task, prefer current category
          if (currentCategoryId) {
            const aInCategory = a.categoryId === currentCategoryId ? 1 : 0;
            const bInCategory = b.categoryId === currentCategoryId ? 1 : 0;
            if (aInCategory !== bInCategory) return bInCategory - aInCategory;
          }
          // Then by match score, then by recency
          return b.score - a.score || new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
        });
    } else {
      // No query - sort by category preference (for switch), then recency
      filtered = filtered.sort((a, b) => {
        if (currentCategoryId) {
          const aInCategory = a.categoryId === currentCategoryId ? 1 : 0;
          const bInCategory = b.categoryId === currentCategoryId ? 1 : 0;
          if (aInCategory !== bInCategory) return bInCategory - aInCategory;
        }
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      });
    }
    
    return filtered.slice(0, 8);
  }, [cachedSuggestions, taskNamePrompt, switchTaskPrompt, promptedTaskName, switchTaskName]);

  // Show/hide suggestions based on filtered results
  useEffect(() => {
    if (suggestions.length > 0 && (selectedCategory || description) && !suppressSuggestionOpenRef.current) {
      setShowSuggestions(true);
    } else if (suggestions.length === 0) {
      setShowSuggestions(false);
    }
    setSelectedSuggestionIndex(-1);
  }, [suggestions, selectedCategory, description]);

  useEffect(() => {
    // Show modal suggestions when modal opens and has suggestions
    // This runs after modalSuggestions recalculates
    if ((taskNamePrompt || switchTaskPrompt) && modalSuggestions.length > 0 && !suppressModalSuggestionOpenRef.current) {
      setShowModalSuggestions(true);
    } else if (!taskNamePrompt && !switchTaskPrompt) {
      setShowModalSuggestions(false);
    }
    setSelectedModalSuggestionIndex(-1);
  }, [modalSuggestions.length, taskNamePrompt, switchTaskPrompt]);

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
      if (
        modalSuggestionsRef.current && 
        !modalSuggestionsRef.current.contains(e.target as Node) &&
        modalInputRef.current &&
        !modalInputRef.current.contains(e.target as Node)
      ) {
        setShowModalSuggestions(false);
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
  
  const handleModalSuggestionSelect = (suggestion: { task_name: string }, isSwitch: boolean) => {
    suppressModalSuggestionOpenRef.current = true;
    if (isSwitch) {
      setSwitchTaskName(suggestion.task_name);
    } else {
      setPromptedTaskName(suggestion.task_name);
    }
    setShowModalSuggestions(false);
    modalInputRef.current?.focus();
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && selectedCategory) {
        handleStart();
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
          handleStart();
        }
        break;
      case 'Escape':
        suppressSuggestionOpenRef.current = true;
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };
  
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isSwitch: boolean, onSubmit: () => void, onCancel: () => void) => {
    if (!showModalSuggestions || modalSuggestions.length === 0) {
      if (e.key === 'Enter') onSubmit();
      if (e.key === 'Escape') onCancel();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedModalSuggestionIndex(prev => 
          prev < modalSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedModalSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedModalSuggestionIndex >= 0) {
          handleModalSuggestionSelect(modalSuggestions[selectedModalSuggestionIndex], isSwitch);
        } else {
          onSubmit();
        }
        break;
      case 'Escape':
        if (showModalSuggestions) {
          e.preventDefault();
          suppressModalSuggestionOpenRef.current = true;
          setShowModalSuggestions(false);
          setSelectedModalSuggestionIndex(-1);
        } else {
          onCancel();
        }
        break;
    }
  };

  // Get recent tasks from entries (unique task_name + category combinations)
  const recentTasks = useMemo((): RecentTask[] => {
    const taskMap = new Map<string, RecentTask>();

    entries
      .filter((e): e is TimeEntry & { task_name: string } => Boolean(e.task_name && e.task_name.trim()))
      .forEach(entry => {
        const key = `${entry.category_id}:${entry.task_name}`;
        const existing = taskMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          taskMap.set(key, {
            task_name: entry.task_name,
            categoryId: entry.category_id,
            categoryName: entry.category_name,
            categoryColor: entry.category_color,
            count: 1
          });
        }
      });
    
    return Array.from(taskMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [entries]);

  useEffect(() => {
    if (!activeEntry) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const start = new Date(activeEntry.start_time).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
      
      // Update scheduled remaining time display
      if (activeEntry.scheduled_end_time) {
        const remaining = new Date(activeEntry.scheduled_end_time).getTime() - now;
        if (remaining <= 0) {
          // Time to auto-stop - trigger stop and refresh
          api.stopEntry(activeEntry.id).then(() => {
            onEntryChange();
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

  const handleStart = async () => {
    if (!selectedCategory) return;
    try {
      await api.startEntry(selectedCategory, description || undefined);
      setDescription('');
      onEntryChange();
    } catch (error) {
      console.error('Failed to start entry:', error);
    }
  };

  const handleQuickStartTask = async (task: RecentTask) => {
    try {
      await api.startEntry(task.categoryId, task.task_name);
      onEntryChange();
    } catch (error) {
      console.error('Failed to start entry:', error);
    }
  };

  const handleCategoryQuickStart = (cat: Category) => {
    setTaskNamePrompt({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color
    });
    setPromptedTaskName('');
  };

  const handlePromptedStart = async () => {
    if (!taskNamePrompt) return;
    try {
      await api.startEntry(taskNamePrompt.categoryId, promptedTaskName || undefined);
      setTaskNamePrompt(null);
      setPromptedTaskName('');
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

  const handleOpenScheduleStop = () => {
    // Reset form state
    setDurationHours('');
    setDurationMinutes('');
    setStopAtTime('');
    setScheduleMode('duration');
    setShowScheduleStopModal(true);
  };

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
      
      // Parse the time input and create a date for today (or tomorrow if time has passed)
      const [hours, minutes] = stopAtTime.split(':').map(Number);
      scheduledEndTime = new Date();
      scheduledEndTime.setHours(hours, minutes, 0, 0);
      
      // If the time has already passed today, schedule for tomorrow
      if (scheduledEndTime <= new Date()) {
        scheduledEndTime.setDate(scheduledEndTime.getDate() + 1);
      }
    }
    
    try {
      await api.scheduleStop(activeEntry.id, scheduledEndTime.toISOString());
      setShowScheduleStopModal(false);
      onEntryChange();
    } catch (error) {
      console.error('Failed to schedule stop:', error);
    }
  };

  const handleClearScheduledStop = async () => {
    if (!activeEntry) return;
    try {
      await api.clearScheduledStop(activeEntry.id);
      onEntryChange();
    } catch (error) {
      console.error('Failed to clear scheduled stop:', error);
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
      await api.startEntry(pausedEntry.category_id, pausedEntry.task_name || undefined);
      setPausedEntry(null);
      onEntryChange();
    } catch (error) {
      console.error('Failed to resume entry:', error);
    }
  };

  const handleSwitchTask = async (categoryId: number, taskDescription?: string) => {
    try {
      // The /start endpoint automatically stops any active entry, so just start the new one
      await api.startEntry(categoryId, taskDescription);
      setShowNewTaskForm(false);
      setSwitchTaskPrompt(null);
      setSwitchTaskName('');
      onEntryChange();
    } catch (error) {
      console.error('Failed to switch task:', error);
    }
  };

  const handleCategorySwitchPrompt = (cat: Category) => {
    setSwitchTaskPrompt({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color
    });
    setSwitchTaskName('');
  };

  const handlePromptedSwitch = async () => {
    if (!switchTaskPrompt) return;
    await handleSwitchTask(switchTaskPrompt.categoryId, switchTaskName || undefined);
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

  const displayCategories = categories.slice(0, 5);

  // Helper to get adaptive colors for a category
  const getCategoryColors = (color: string | null) => getAdaptiveCategoryColors(color, isDarkMode);

  return (
    <div className="time-tracker card">
      {activeEntry ? (
        <div className="active-tracker-container">
          <div className="active-tracker">
            <div className="timer-display">
              <div className="timer-time">{formatTime(elapsed)}</div>
              <div className="timer-info">
                {(() => {
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
                })()}
                {activeEntry.task_name && <span className="timer-description">{activeEntry.task_name}</span>}
              </div>
            </div>
            <div className="timer-actions">
              {activeEntry.scheduled_end_time ? (
                <button 
                  className="btn btn-scheduled" 
                  onClick={handleClearScheduledStop}
                  title="Click to cancel scheduled stop"
                >
                  <span className="schedule-icon">⏱</span>
                  Stops in {scheduledRemaining}
                </button>
              ) : (
                <button 
                  className="btn btn-ghost" 
                  onClick={handleOpenScheduleStop}
                  title="Schedule auto-stop"
                >
                  <span className="schedule-icon">⏱</span>
                  Schedule
                </button>
              )}
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
          
          {/* Schedule stop modal */}
          {showScheduleStopModal && (
            <div className="task-prompt-overlay" onClick={() => setShowScheduleStopModal(false)}>
              <div className="task-prompt-modal schedule-stop-modal" onClick={e => e.stopPropagation()}>
                <div className="task-prompt-header">
                  <span className="task-prompt-title">Schedule Auto-Stop</span>
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
                      type="time"
                      value={stopAtTime}
                      onChange={(e) => setStopAtTime(e.target.value)}
                      className="time-input"
                      autoFocus
                    />
                    <span className="time-hint">
                      {stopAtTime && (() => {
                        const [h, m] = stopAtTime.split(':').map(Number);
                        const target = new Date();
                        target.setHours(h, m, 0, 0);
                        if (target <= new Date()) {
                          return 'Tomorrow';
                        }
                        return 'Today';
                      })()}
                    </span>
                  </div>
                )}
                
                <div className="schedule-quick-options">
                  <span className="quick-options-label">Quick:</span>
                  {[15, 30, 45, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      className="quick-duration-btn"
                      onClick={() => {
                        setScheduleMode('duration');
                        setDurationHours(Math.floor(mins / 60).toString());
                        setDurationMinutes((mins % 60).toString());
                      }}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                </div>
                
                <div className="task-prompt-actions">
                  <button className="btn btn-ghost" onClick={() => setShowScheduleStopModal(false)}>
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
                    Schedule Stop
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Switch task section while tracking */}
          <div className="switch-task-section">
            {/* Switch task prompt modal */}
            {switchTaskPrompt && (
              <div className="task-prompt-overlay" onClick={() => setSwitchTaskPrompt(null)}>
                <div className="task-prompt-modal" onClick={e => e.stopPropagation()}>
                  <div className="task-prompt-header">
                    <span className="task-prompt-title">Switch to</span>
                    {(() => {
                      const colors = getCategoryColors(switchTaskPrompt.categoryColor);
                      return (
                        <span 
                          className="category-badge" 
                          style={{ 
                            backgroundColor: colors.bgColor,
                            color: colors.textColor
                          }}
                        >
                          <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                          {switchTaskPrompt.categoryName}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="description-input-wrapper">
                    <input
                      ref={modalInputRef}
                      type="text"
                      className="task-prompt-input"
                      value={switchTaskName}
                      onChange={(e) => {
                        suppressModalSuggestionOpenRef.current = false;
                        setSwitchTaskName(e.target.value);
                      }}
                      placeholder="What are you working on? (optional)"
                      autoFocus
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      data-form-type="other"
                      onFocus={() => {
                        if (modalSuggestions.length > 0 && !suppressModalSuggestionOpenRef.current) {
                          setShowModalSuggestions(true);
                        }
                      }}
                      onKeyDown={(e) => handleModalKeyDown(e, true, handlePromptedSwitch, () => setSwitchTaskPrompt(null))}
                    />
                  {showModalSuggestions && modalSuggestions.length > 0 && (
                    <div className="description-suggestions modal-suggestions" ref={modalSuggestionsRef}>
                      {modalSuggestions.map((suggestion, idx) => {
                        const cat = categories.find(c => c.id === suggestion.categoryId);
                        const colors = getCategoryColors(cat?.color || null);
                        return (
                          <button
                            key={`${suggestion.categoryId}-${suggestion.task_name}`}
                            className={`suggestion-item ${idx === selectedModalSuggestionIndex ? 'selected' : ''}`}
                            onClick={() => handleModalSuggestionSelect(suggestion, true)}
                            onMouseEnter={() => setSelectedModalSuggestionIndex(idx)}
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
                  <div className="task-prompt-actions">
                    <button className="btn btn-ghost" onClick={() => setSwitchTaskPrompt(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-success" onClick={handlePromptedSwitch}>
                      <span className="play-icon">▶</span>
                      Switch
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="switch-task-header">
              <span className="switch-label">Switch to:</span>
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => setShowNewTaskForm(!showNewTaskForm)}
              >
                {showNewTaskForm ? 'Cancel' : '+ New task'}
              </button>
            </div>
            
            {showNewTaskForm ? (
              <div className="new-task-inline">
                <select 
                  className="switch-category-select"
                  value={selectedCategory || ''} 
                  onChange={(e) => {
                    suppressSuggestionOpenRef.current = false;
                    setSelectedCategory(Number(e.target.value));
                  }}
                >
                  <option value="">Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
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
                    placeholder="Task name (optional)"
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
                        case 'Escape':
                          suppressSuggestionOpenRef.current = true;
                          setShowSuggestions(false);
                          setSelectedSuggestionIndex(-1);
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
                  className="btn btn-success btn-sm"
                  onClick={() => selectedCategory && handleSwitchTask(selectedCategory, description || undefined)}
                  disabled={!selectedCategory}
                >
                  Start
                </button>
              </div>
            ) : (
              <div className="switch-quick-options">
                {recentTasks.slice(0, 3).map((task, idx) => {
                  const colors = getCategoryColors(task.categoryColor);
                  return (
                    <button
                      key={idx}
                      className="switch-task-btn"
                      onClick={() => handleSwitchTask(task.categoryId, task.task_name)}
                      title={`${task.categoryName}: ${task.task_name}`}
                    >
                      <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                      <span className="switch-task-description">{task.task_name}</span>
                    </button>
                  );
                })}
                {displayCategories.slice(0, 2).map(cat => {
                  const colors = getCategoryColors(cat.color);
                  return (
                    <button
                      key={cat.id}
                      className="switch-category-btn"
                      style={{ borderColor: colors.textColor, color: colors.textColor }}
                      onClick={() => handleCategorySwitchPrompt(cat)}
                    >
                      <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : pausedEntry ? (
        <div className="paused-tracker">
          <div className="paused-info">
            <span className="paused-label">⏸ Paused</span>
            {(() => {
              const colors = getCategoryColors(pausedEntry.category_color);
              return (
                <span 
                  className="category-badge" 
                  style={{ 
                    backgroundColor: colors.bgColor,
                    color: colors.textColor
                  }}
                >
                  <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                  {pausedEntry.category_name}
                </span>
              );
            })()}
            {pausedEntry.task_name && <span className="timer-description">{pausedEntry.task_name}</span>}
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
          {/* Task name prompt modal */}
          {taskNamePrompt && (
            <div className="task-prompt-overlay" onClick={() => setTaskNamePrompt(null)}>
              <div className="task-prompt-modal" onClick={e => e.stopPropagation()}>
                <div className="task-prompt-header">
                  {(() => {
                    const colors = getCategoryColors(taskNamePrompt.categoryColor);
                    return (
                      <span 
                        className="category-badge" 
                        style={{ 
                          backgroundColor: colors.bgColor,
                          color: colors.textColor
                        }}
                      >
                        <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                        {taskNamePrompt.categoryName}
                      </span>
                    );
                  })()}
                </div>
                <div className="description-input-wrapper">
                  <input
                    ref={modalInputRef}
                    type="text"
                    className="task-prompt-input"
                    value={promptedTaskName}
                      onChange={(e) => {
                        suppressModalSuggestionOpenRef.current = false;
                        setPromptedTaskName(e.target.value);
                      }}
                    placeholder="What are you working on? (optional)"
                    autoFocus
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                      onFocus={() => {
                        if (modalSuggestions.length > 0 && !suppressModalSuggestionOpenRef.current) {
                          setShowModalSuggestions(true);
                        }
                      }}
                    onKeyDown={(e) => handleModalKeyDown(e, false, handlePromptedStart, () => setTaskNamePrompt(null))}
                  />
                  {showModalSuggestions && modalSuggestions.length > 0 && (
                    <div className="description-suggestions modal-suggestions" ref={modalSuggestionsRef}>
                      {modalSuggestions.map((suggestion, idx) => {
                        const cat = categories.find(c => c.id === suggestion.categoryId);
                        const colors = getCategoryColors(cat?.color || null);
                        return (
                          <button
                            key={`${suggestion.categoryId}-${suggestion.task_name}`}
                            className={`suggestion-item ${idx === selectedModalSuggestionIndex ? 'selected' : ''}`}
                            onClick={() => handleModalSuggestionSelect(suggestion, false)}
                            onMouseEnter={() => setSelectedModalSuggestionIndex(idx)}
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
                <div className="task-prompt-actions">
                  <button className="btn btn-ghost" onClick={() => setTaskNamePrompt(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-success" onClick={handlePromptedStart}>
                    <span className="play-icon">▶</span>
                    Start
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick start section with tasks and categories */}
          {(recentTasks.length > 0 || displayCategories.length > 0) && (
            <div className="quick-start-section">
              {recentTasks.length > 0 && (
                <div className="quick-start-group">
                  <span className="quick-start-label">Recent tasks</span>
                  <div className="quick-start-buttons">
                      {recentTasks.map((task, idx) => {
                      const colors = getCategoryColors(task.categoryColor);
                      return (
                        <button
                          key={idx}
                          className="quick-start-btn quick-start-task"
                          onClick={() => handleQuickStartTask(task)}
                          title={`${task.categoryName}: ${task.task_name}`}
                        >
                          <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                          <span className="task-description-text">{task.task_name}</span>
                          <span className="task-category-hint">{task.categoryName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="quick-start-group">
                <span className="quick-start-label">Categories</span>
                <div className="quick-start-buttons">
                  {displayCategories.map(cat => {
                    const colors = getCategoryColors(cat.color);
                    return (
                      <button
                        key={cat.id}
                        className="quick-start-btn quick-start-category"
                        style={{ borderColor: colors.textColor, color: colors.textColor }}
                        onClick={() => handleCategoryQuickStart(cat)}
                      >
                        <span className="category-dot" style={{ backgroundColor: colors.dotColor }} />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
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

              <div className="form-group form-group-description">
                <label>Task <span className="optional">(optional)</span></label>
                <div className="description-input-wrapper">
                  <input 
                    ref={descriptionInputRef}
                    type="text"
                    value={description}
                    onChange={(e) => {
                      suppressSuggestionOpenRef.current = false;
                      setDescription(e.target.value);
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0 && !suppressSuggestionOpenRef.current) {
                        setShowSuggestions(true);
                      }
                    }}
                    onKeyDown={handleDescriptionKeyDown}
                    placeholder="What are you working on?"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
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
