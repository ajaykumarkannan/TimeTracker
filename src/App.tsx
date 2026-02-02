import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Landing } from './components/Landing';
import { Login } from './components/Login';
import { TimeTracker } from './components/TimeTracker';
import { TimeEntryList } from './components/TimeEntryList';
import { CategoryManager } from './components/CategoryManager';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { Help } from './components/Help';
import { ThemeToggle } from './components/ThemeToggle';
import { api } from './api';
import { Category, TimeEntry } from './types';
import './App.css';

type Tab = 'tracker' | 'categories' | 'analytics' | 'settings' | 'help';

function AppContent({ isLoggedIn, onLogout, onConvertSuccess }: { isLoggedIn: boolean; onLogout: () => void; onConvertSuccess: () => void }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('chronoflow_tab');
    return (saved as Tab) || 'tracker';
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('chronoflow_tab', tab);
  };

  const loadData = async () => {
    try {
      const [cats, ents, active] = await Promise.all([
        api.getCategories(),
        api.getTimeEntries(),
        api.getActiveEntry()
      ]);
      setCategories(cats);
      setEntries(ents);
      setActiveEntry(active);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleCategoryChange = async () => {
    const cats = await api.getCategories();
    setCategories(cats);
  };

  const handleEntryChange = async () => {
    const [ents, active] = await Promise.all([
      api.getTimeEntries(),
      api.getActiveEntry()
    ]);
    setEntries(ents);
    setActiveEntry(active);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'tracker', label: 'Track', icon: '⏱️' },
    { id: 'categories', label: 'Categories', icon: '🏷️' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'help', label: 'Help', icon: '❓' }
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left"></div>
        <div className="header-center">
          <div className="logo">
            <svg viewBox="0 0 48 48" className="logo-icon">
              <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="24" cy="24" r="3" fill="currentColor" />
              <line x1="24" y1="24" x2="24" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="24" x2="34" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="logo-text">ChronoFlow</span>
          </div>
        </div>
        <div className="header-right">
          {!isLoggedIn && (
            <span className="mode-badge">Guest Mode</span>
          )}
          <ThemeToggle />
          <div className="user-menu">
            {isLoggedIn && user && (
              <span className="username">{user.name}</span>
            )}
            <button onClick={onLogout} className="logout-btn" title={isLoggedIn ? 'Sign out' : 'Exit'}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <nav className="app-nav">
        <div className="nav-content">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="app-main">
        {activeTab === 'tracker' && (
          <>
            <TimeTracker
              categories={categories}
              activeEntry={activeEntry}
              entries={entries}
              onEntryChange={handleEntryChange}
              onCategoryChange={handleCategoryChange}
            />
            <TimeEntryList
              entries={entries}
              categories={categories}
              onEntryChange={handleEntryChange}
            />
          </>
        )}
        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            onCategoryChange={handleCategoryChange}
          />
        )}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'settings' && (
          <Settings onLogout={onLogout} onConvertSuccess={onConvertSuccess} />
        )}
        {activeTab === 'help' && <Help />}
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const [showLanding, setShowLanding] = useState(() => {
    // Show landing if no session and not logged in
    const hasSession = !!localStorage.getItem('sessionId');
    const hasToken = !!localStorage.getItem('accessToken');
    return !hasSession && !hasToken;
  });
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading ChronoFlow...</p>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    // Clear session for guest users too
    localStorage.removeItem('sessionId');
    localStorage.removeItem('chronoflow_tab');
    setShowLanding(true);
  };

  const handleStartGuest = () => {
    // Session ID will be created automatically on first API call
    setShowLanding(false);
  };

  const handleLogin = () => {
    setShowLogin(true);
  };

  const handleLoginBack = () => {
    setShowLogin(false);
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    setShowLanding(false);
  };

  const handleConvertSuccess = () => {
    // Reload to refresh auth state
    window.location.reload();
  };

  // Show login screen
  if (showLogin) {
    return <Login onBack={handleLoginBack} onSuccess={handleLoginSuccess} />;
  }

  // Show landing page
  if (showLanding && !user) {
    return <Landing onLogin={handleLogin} onGuest={handleStartGuest} />;
  }

  // Show main app
  return <AppContent isLoggedIn={!!user} onLogout={handleLogout} onConvertSuccess={handleConvertSuccess} />;
}
