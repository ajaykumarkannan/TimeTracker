import { useState, useEffect, useMemo } from 'react';
import { Category, TimeEntry } from '../types';
import { api } from '../api';
import './TimeTracker.css';

interface Props {
  categories: Category[];
  activeEntry: TimeEntry | null;
  entries: TimeEntry[];
  onEntryChange: () => void;
  onCategoryChange: () => void;
}

interface RecentTask {
  note: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string | null;
  count: number;
}

export function TimeTracker({ categories, activeEntry, entries, onEntryChange, onCategoryChange }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [pausedEntry, setPausedEntry] = useState<TimeEntry | null>(null);
  const [taskNamePrompt, setTaskNamePrompt] = useState<{ categoryId: number; categoryName: string; categoryColor: string | null } | null>(null);
  const [promptedTaskName, setPromptedTaskName] = useState('');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [switchTaskPrompt, setSwitchTaskPrompt] = useState<{ categoryId: number; categoryName: string; categoryColor: string | null } | null>(null);
  const [switchTaskName, setSwitchTaskName] = useState('');

  // Get recent tasks from entries (unique note + category combinations)
  const recentTasks = useMemo((): RecentTask[] => {
    const taskMap = new Map<string, RecentTask>();
    
    entries
      .filter(e => e.note && e.note.trim())
      .forEach(entry => {
        const key = `${entry.category_id}:${entry.note}`;
        const existing = taskMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          taskMap.set(key, {
            note: entry.note!,
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

  const handleQuickStartTask = async (task: RecentTask) => {
    try {
      await api.startEntry(task.categoryId, task.note);
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

  const handleSwitchTask = async (categoryId: number, taskNote?: string) => {
    try {
      // Stop current entry and start new one
      if (activeEntry) {
        await api.stopEntry(activeEntry.id);
      }
      await api.startEntry(categoryId, taskNote);
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

  const displayCategories = categories.slice(0, 5);

  return (
    <div className="time-tracker card">
      {activeEntry ? (
        <div className="active-tracker-container">
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
          
          {/* Switch task section while tracking */}
          <div className="switch-task-section">
            {/* Switch task prompt modal */}
            {switchTaskPrompt && (
              <div className="task-prompt-overlay" onClick={() => setSwitchTaskPrompt(null)}>
                <div className="task-prompt-modal" onClick={e => e.stopPropagation()}>
                  <div className="task-prompt-header">
                    <span className="task-prompt-title">Switch to</span>
                    <span 
                      className="category-badge" 
                      style={{ 
                        backgroundColor: `${switchTaskPrompt.categoryColor}20`,
                        color: switchTaskPrompt.categoryColor || '#6366f1'
                      }}
                    >
                      <span className="category-dot" style={{ backgroundColor: switchTaskPrompt.categoryColor || '#6366f1' }} />
                      {switchTaskPrompt.categoryName}
                    </span>
                  </div>
                  <input
                    type="text"
                    className="task-prompt-input"
                    value={switchTaskName}
                    onChange={(e) => setSwitchTaskName(e.target.value)}
                    placeholder="What are you working on? (optional)"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePromptedSwitch();
                      if (e.key === 'Escape') setSwitchTaskPrompt(null);
                    }}
                  />
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
                  onChange={(e) => setSelectedCategory(Number(e.target.value))}
                >
                  <option value="">Category...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <input 
                  type="text"
                  className="switch-note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Task name (optional)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && selectedCategory) {
                      handleSwitchTask(selectedCategory, note || undefined);
                    }
                  }}
                />
                <button 
                  className="btn btn-success btn-sm"
                  onClick={() => selectedCategory && handleSwitchTask(selectedCategory, note || undefined)}
                  disabled={!selectedCategory}
                >
                  Start
                </button>
              </div>
            ) : (
              <div className="switch-quick-options">
                {recentTasks.slice(0, 3).map((task, idx) => (
                  <button
                    key={idx}
                    className="switch-task-btn"
                    onClick={() => handleSwitchTask(task.categoryId, task.note)}
                    title={`${task.categoryName}: ${task.note}`}
                  >
                    <span className="category-dot" style={{ backgroundColor: task.categoryColor || '#6366f1' }} />
                    <span className="switch-task-note">{task.note}</span>
                  </button>
                ))}
                {displayCategories.slice(0, 2).map(cat => (
                  <button
                    key={cat.id}
                    className="switch-category-btn"
                    style={{ borderColor: cat.color || '#6366f1', color: cat.color || '#6366f1' }}
                    onClick={() => handleCategorySwitchPrompt(cat)}
                  >
                    <span className="category-dot" style={{ backgroundColor: cat.color || '#6366f1' }} />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
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
          {/* Task name prompt modal */}
          {taskNamePrompt && (
            <div className="task-prompt-overlay" onClick={() => setTaskNamePrompt(null)}>
              <div className="task-prompt-modal" onClick={e => e.stopPropagation()}>
                <div className="task-prompt-header">
                  <span 
                    className="category-badge" 
                    style={{ 
                      backgroundColor: `${taskNamePrompt.categoryColor}20`,
                      color: taskNamePrompt.categoryColor || '#6366f1'
                    }}
                  >
                    <span className="category-dot" style={{ backgroundColor: taskNamePrompt.categoryColor || '#6366f1' }} />
                    {taskNamePrompt.categoryName}
                  </span>
                </div>
                <input
                  type="text"
                  className="task-prompt-input"
                  value={promptedTaskName}
                  onChange={(e) => setPromptedTaskName(e.target.value)}
                  placeholder="What are you working on? (optional)"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePromptedStart();
                    if (e.key === 'Escape') setTaskNamePrompt(null);
                  }}
                />
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
                    {recentTasks.map((task, idx) => (
                      <button
                        key={idx}
                        className="quick-start-btn quick-start-task"
                        onClick={() => handleQuickStartTask(task)}
                        title={`${task.categoryName}: ${task.note}`}
                      >
                        <span className="category-dot" style={{ backgroundColor: task.categoryColor || '#6366f1' }} />
                        <span className="task-note-text">{task.note}</span>
                        <span className="task-category-hint">{task.categoryName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="quick-start-group">
                <span className="quick-start-label">Categories</span>
                <div className="quick-start-buttons">
                  {displayCategories.map(cat => (
                    <button
                      key={cat.id}
                      className="quick-start-btn quick-start-category"
                      style={{ borderColor: cat.color || '#6366f1', color: cat.color || '#6366f1' }}
                      onClick={() => handleCategoryQuickStart(cat)}
                    >
                      <span className="category-dot" style={{ backgroundColor: cat.color || '#6366f1' }} />
                      {cat.name}
                    </button>
                  ))}
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
