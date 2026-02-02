import { useState, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { TimezoneProvider, useTimezone } from './contexts/TimezoneContext';
import { Landing } from './components/Landing';
import { Login } from './components/Login';
import { TimeTracker } from './components/TimeTracker';
import { TimeEntryList } from './components/TimeEntryList';
import { CategoryManager } from './components/CategoryManager';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { Help } from './components/Help';
import { ThemeToggle } from './components/ThemeToggle';
import { SettingsIcon, LogoutIcon, HelpIcon, ClockIcon, TagIcon, ChartIcon } from './components/Icons';
import { api } from './api';
import { Category, TimeEntry } from './types';
import './App.css';

type Tab = 'tracker' | 'categories' | 'analytics';

function AppContent({ isLoggedIn, onLogout, onConvertSuccess }: { isLoggedIn: boolean; onLogout: () => void; onConvertSuccess: () => void }) {
  const { user } = useAuth();
  const { showTimezonePrompt, detectedTimezone, acceptDetectedTimezone, dismissTimezonePrompt, timezone } = useTimezone();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('chronoflow_tab');
    // Reset to tracker if saved tab was settings or help (now in menu)
    if (saved === 'settings' || saved === 'help') return 'tracker';
    return (saved as Tab) || 'tracker';
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'tracker', label: 'Track', icon: <ClockIcon size={16} /> },
    { id: 'categories', label: 'Categories', icon: <TagIcon size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <ChartIcon size={16} /> }
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
          <div className="settings-menu-container" ref={menuRef}>
            <button 
              className="settings-menu-btn"
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="Settings"
              aria-label="Settings menu"
            >
              <SettingsIcon size={18} />
            </button>
            {showSettingsMenu && (
              <div className="settings-dropdown">
                {isLoggedIn && user && (
                  <div className="settings-dropdown-user">
                    <span className="settings-dropdown-name">{user.name}</span>
                    <span className="settings-dropdown-email">{user.email}</span>
                  </div>
                )}
                <button 
                  className="settings-dropdown-item"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    setShowSettingsModal(true);
                  }}
                >
                  <SettingsIcon size={16} />
                  <span>Settings</span>
                </button>
                <button 
                  className="settings-dropdown-item"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    setShowHelpModal(true);
                  }}
                >
                  <HelpIcon size={16} />
                  <span>Help</span>
                </button>
                <button 
                  className="settings-dropdown-item settings-dropdown-logout"
                  onClick={() => {
                    setShowSettingsMenu(false);
                    onLogout();
                  }}
                >
                  <LogoutIcon size={16} />
                  <span>{isLoggedIn ? 'Sign out' : 'Exit'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Timezone change prompt */}
      {showTimezonePrompt && detectedTimezone && (
        <div className="timezone-prompt">
          <span>
            Your timezone appears to have changed to <strong>{detectedTimezone.replace(/_/g, ' ')}</strong>. 
            Currently using <strong>{timezone.replace(/_/g, ' ')}</strong>.
          </span>
          <div className="timezone-prompt-actions">
            <button className="btn-small btn-primary" onClick={acceptDetectedTimezone}>
              Update
            </button>
            <button className="btn-small btn-ghost" onClick={dismissTimezonePrompt}>
              Dismiss
            </button>
          </div>
        </div>
      )}

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
      </main>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="settings-modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button 
                className="settings-modal-close"
                onClick={() => setShowSettingsModal(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>
            <div className="settings-modal-content">
              <Settings onLogout={onLogout} onConvertSuccess={onConvertSuccess} />
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="settings-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Help</h2>
              <button 
                className="settings-modal-close"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close help"
              >
                ×
              </button>
            </div>
            <div className="settings-modal-content">
              <Help />
            </div>
          </div>
        </div>
      )}
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
  return (
    <TimezoneProvider>
      <AppContent isLoggedIn={!!user} onLogout={handleLogout} onConvertSuccess={handleConvertSuccess} />
    </TimezoneProvider>
  );
}
