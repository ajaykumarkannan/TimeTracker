import { useState, useEffect, useCallback } from 'react';
import { TimeTracker } from './components/TimeTracker';
import { CategoryManager } from './components/CategoryManager';
import { TimeEntryList } from './components/TimeEntryList';
import { Analytics } from './components/Analytics';
import { Category, TimeEntry } from './types';
import { api } from './api';
import { useIdleDetection } from './hooks/useIdleDetection';
import './App.css';

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [view, setView] = useState<'tracker' | 'categories' | 'analytics'>('tracker');
  const [autoPaused, setAutoPaused] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cats, entries, active] = await Promise.all([
        api.getCategories(),
        api.getTimeEntries(),
        api.getActiveEntry()
      ]);
      setCategories(cats);
      setTimeEntries(entries);
      setActiveEntry(active);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, []);

  const handleIdle = useCallback(async () => {
    if (activeEntry) {
      try {
        await api.stopEntry(activeEntry.id);
        setAutoPaused(true);
        loadData();
      } catch (error) {
        console.error('Failed to auto-pause:', error);
      }
    }
  }, [activeEntry, loadData]);

  const handleResume = async () => {
    if (autoPaused && activeEntry) {
      try {
        // Restart with same category and note
        const lastEntry = timeEntries[0];
        if (lastEntry) {
          await api.startEntry(lastEntry.category_id, lastEntry.note || undefined);
          loadData();
        }
      } catch (error) {
        console.error('Failed to resume:', error);
      }
    }
    setAutoPaused(false);
  };

  const { isWarning, resetTimer, secondsUntilIdle } = useIdleDetection({
    idleTimeout: 5 * 60 * 1000, // 5 minutes
    warningTimeout: 4 * 60 * 1000, // Warning at 4 minutes
    onIdle: handleIdle,
    enabled: !!activeEntry && !autoPaused
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to toggle timer
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (activeEntry) {
          api.stopEntry(activeEntry.id).then(loadData);
        }
      }
      // Cmd/Ctrl + 1/2 for tabs
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        setView('tracker');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        setView('categories');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        setView('analytics');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeEntry, loadData]);

  return (
    <div className="app">
      {isWarning && activeEntry && (
        <div className="idle-warning animate-slide-in">
          ⚠️ Timer will auto-pause in {secondsUntilIdle}s due to inactivity
          <button onClick={resetTimer}>I'm still here</button>
        </div>
      )}
      
      {autoPaused && (
        <div className="idle-warning" style={{ background: 'var(--accent)' }}>
          Timer was auto-paused due to inactivity
          <button onClick={handleResume}>Resume tracking</button>
        </div>
      )}

      <header className="app-header">
        <div className="app-header-content">
          <h1>Time Tracker</h1>
          <div className="header-right">
            <div className="status-indicator">
              <span className={`status-dot ${activeEntry ? '' : autoPaused ? 'paused' : 'idle'}`} />
              {activeEntry ? 'Tracking' : autoPaused ? 'Paused' : 'Idle'}
            </div>
            <nav>
              <button 
                className={view === 'tracker' ? 'active' : ''}
                onClick={() => setView('tracker')}
              >
                Tracker
              </button>
              <button 
                className={view === 'categories' ? 'active' : ''}
                onClick={() => setView('categories')}
              >
                Categories
              </button>
              <button 
                className={view === 'analytics' ? 'active' : ''}
                onClick={() => setView('analytics')}
              >
                Analytics
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="app-main">
        {view === 'tracker' && (
          <>
            <TimeTracker 
              categories={categories}
              activeEntry={activeEntry}
              entries={timeEntries}
              onUpdate={loadData}
            />
            <TimeEntryList 
              entries={timeEntries}
              categories={categories}
              onUpdate={loadData}
            />
          </>
        )}
        {view === 'categories' && (
          <CategoryManager 
            categories={categories}
            onUpdate={loadData}
          />
        )}
        {view === 'analytics' && <Analytics />}
      </main>
    </div>
  );
}

export default App;
