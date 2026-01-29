import { useState, useEffect } from 'react';
import { TimeTracker } from './components/TimeTracker';
import { CategoryManager } from './components/CategoryManager';
import { TimeEntryList } from './components/TimeEntryList';
import { Category, TimeEntry } from './types';
import { api } from './api';
import './App.css';

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [view, setView] = useState<'tracker' | 'categories'>('tracker');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-content">
          <h1>Time Tracker</h1>
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
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'tracker' ? (
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
        ) : (
          <CategoryManager 
            categories={categories}
            onUpdate={loadData}
          />
        )}
      </main>
    </div>
  );
}

export default App;
