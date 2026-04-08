import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { TimezoneProvider, useTimezone } from './contexts/TimezoneContext';
import { useTheme } from './contexts/ThemeContext';
import { Landing } from './components/Landing';
import { Login } from './components/Login';
import { TimeTracker } from './components/TimeTracker';
import { TimeEntryList } from './components/TimeEntryList';
import { CategoryManager } from './components/CategoryManager';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { Help } from './components/Help';
import { ThemeToggle } from './components/ThemeToggle';
import { LogoIcon } from './components/LogoIcon';
import { SettingsIcon, LogoutIcon, HelpIcon, ClockIcon, TagIcon, ChartIcon } from './components/Icons';
import { api, onApiError } from './api';
import { useSync } from './hooks/useSync';
import { useAppBadge } from './hooks/useAppBadge';
import { useClickOutside } from './hooks/useClickOutside';
import { Category, TimeEntry } from './types';
import './App.css';

type Tab = 'tracker' | 'categories' | 'analytics';

// Hook to detect mobile devices
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

// Hook for detecting short vertical viewport (e.g. landscape phones)
function useIsShortViewport(threshold = 500) {
  const [isShort, setIsShort] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsShort(window.innerHeight <= threshold);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [threshold]);

  return isShort;
}

// Hook for hide-on-scroll header
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      const scrolledPastThreshold = currentScrollY > 60;
      
      setHidden(scrollingDown && scrolledPastThreshold);
      lastScrollY.current = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  return hidden;
}

export function AppContent({ isLoggedIn, onLogout, onConvertSuccess }: { isLoggedIn: boolean; onLogout: () => void; onConvertSuccess: () => void }) {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const { showTimezonePrompt, detectedTimezone, acceptDetectedTimezone, dismissTimezonePrompt, timezone } = useTimezone();
  const isMobile = useIsMobile();
  const headerHidden = useHideOnScroll();
  const isShortViewport = useIsShortViewport();
  const [headerRevealed, setHeaderRevealed] = useState(false);

  // Reset revealed state when viewport is no longer short
  useEffect(() => {
    if (!isShortViewport) setHeaderRevealed(false);
  }, [isShortViewport]);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('chronoflow_tab');
    // Reset to tracker if saved tab was settings or help (now in menu)
    if (saved === 'settings' || saved === 'help') return 'tracker';
    return (saved as Tab) || 'tracker';
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [entryRefreshKey, setEntryRefreshKey] = useState(0);
  const [lastOptimistic, setLastOptimistic] = useState<{ active?: TimeEntry | null; stopped?: TimeEntry } | null>(null);
  const isRefreshingRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);
  const serverVersionRef = useRef<string | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const appVersion = __APP_VERSION__;

  // Show tracking indicator on browser tab favicon and PWA dock badge
  useAppBadge(activeEntry !== null);

  // Auto-resume an entry whose end_time is in the future (user edited it forward)
  // Sets the future time as a scheduled stop so the countdown shows in the tracker
  const autoResumeFutureEntry = useCallback(async (recentEnts: TimeEntry[], active: TimeEntry | null): Promise<TimeEntry | null> => {
    if (active) return active; // Already tracking
    // Find the most recent completed entry
    const completed = recentEnts.filter((e): e is TimeEntry & { end_time: string } => !!e.end_time);
    if (completed.length === 0) return null;
    const mostRecent = completed.reduce((latest, e) =>
      new Date(e.end_time).getTime() > new Date(latest.end_time).getTime() ? e : latest
    );
    const futureEndTime = mostRecent.end_time;
    // If its end_time is in the future, resume it and set scheduled stop
    if (new Date(futureEndTime).getTime() > Date.now()) {
      try {
        await api.updateEntry(mostRecent.id, { end_time: null } as Partial<TimeEntry>);
        await api.scheduleStop(mostRecent.id, futureEndTime);
        return await api.getActiveEntry();
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  // Shared helper: fetch recent entries + active entry, then auto-resume if needed
  const fetchAndResolveEntries = useCallback(async () => {
    const [recentEnts, active] = await Promise.all([
      api.getRecentEntries(20),
      api.getActiveEntry()
    ]);
    const resolvedActive = await autoResumeFutureEntry(recentEnts, active);
    if (resolvedActive && !active) {
      const updatedEntries = await api.getRecentEntries(20);
      setEntries(updatedEntries);
      setActiveEntry(resolvedActive);
    } else {
      setEntries(recentEnts);
      setActiveEntry(active);
    }
  }, [autoResumeFutureEntry]);

  // Handle sync events from other tabs/devices
  const handleSyncEvent = useCallback((event: { type: string; source: string }) => {
    if (event.type === 'time-entries' || event.type === 'all') {
      fetchAndResolveEntries().then(() => {
        setEntryRefreshKey(k => k + 1);
      }).catch(console.error);
    }
    if (event.type === 'categories' || event.type === 'all') {
      api.getCategories().then(setCategories).catch(console.error);
    }
  }, [fetchAndResolveEntries]);

  // Set up real-time sync
  const { broadcastChange } = useSync({
    onSync: handleSyncEvent,
    enabled: true
  });

  // Update theme-color meta tag when theme changes
  useEffect(() => {
    const themeColor = resolvedTheme === 'dark' ? '#18181b' : '#ffffff';
    const metaTags = document.querySelectorAll('meta[name="theme-color"]');
    metaTags.forEach(tag => tag.setAttribute('content', themeColor));
  }, [resolvedTheme]);

  useEffect(() => {
    loadData();
  }, []);

  // Close menus when clicking outside
  useClickOutside(menuRef, () => setShowSettingsMenu(false));
  useClickOutside(mobileNavRef, () => setShowMobileNav(false));

  // Show a banner when the API returns a rate-limit (429) error
  useEffect(() => {
    const unsub = onApiError((err) => {
      if (err.type === 'rate_limit') {
        setRateLimitMsg(err.message);
        // Auto-dismiss after the retry window passes (plus a small buffer)
        const timer = setTimeout(() => setRateLimitMsg(null), (err.retryAfterSec + 2) * 1000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, []);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('chronoflow_tab', tab);
    setShowMobileNav(false);
  };

  const refreshTrackerData = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      await fetchAndResolveEntries();
    } catch (error) {
      console.error('Failed to refresh tracker data:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [fetchAndResolveEntries]);

  const loadData = async () => {
    try {
      const [cats] = await Promise.all([
        api.getCategories(),
        fetchAndResolveEntries()
      ]);
      setCategories(cats);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  useEffect(() => {
    // Minimum gap between refreshes to avoid duplicate triggers
    const debounceMs = 5000;
    const lastRefreshRef = { current: 0 };
    const lastVersionCheckRef = { current: 0 };
    let hiddenAt: number | null = null;

    const checkVersion = async (now: number) => {
      // Check version at most once per 5 minutes
      if (now - lastVersionCheckRef.current < 300000) return;
      lastVersionCheckRef.current = now;
      try {
        const res = await fetch('/api/version');
        if (res.ok) {
          const data = await res.json();
          if (data.app && data.app !== '0.0.0' && data.app !== appVersion && appVersion !== '0.0.0'
              && data.app !== dismissedVersionRef.current) {
            serverVersionRef.current = data.app;
            setUpdateAvailable(true);
          }
        }
      } catch {
        // Ignore — version check is best-effort
      }
    };

    const refreshOnResume = () => {
      if (document.visibilityState !== 'visible') {
        // Track when we became hidden
        hiddenAt = Date.now();
        return;
      }
      
      const now = Date.now();
      // Debounce — visibilitychange and focus can fire in quick succession
      if (now - lastRefreshRef.current < debounceMs) return;

      // After a very long absence (e.g. overnight, weekend) do a full page
      // reload so all auth state, service-worker caches, and component trees
      // start fresh instead of trying to incrementally patch stale data.
      const FULL_RELOAD_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
      if (hiddenAt !== null && (now - hiddenAt > FULL_RELOAD_THRESHOLD_MS)) {
        hiddenAt = null;
        window.location.reload();
        return;
      }
      
      lastRefreshRef.current = now;
      refreshTrackerData();

      // Only reload the entry list after a long absence (sleep/wake, long tab switch)
      // Short tab switches don't need a full entry list reload — SSE/BroadcastChannel
      // handle real-time sync for changes made on other tabs/devices.
      const wasLongHidden = hiddenAt !== null && (now - hiddenAt > 30000);
      hiddenAt = null;
      if (wasLongHidden) {
        setEntryRefreshKey(k => k + 1);
      }

      // Lightweight version check (throttled to once per 5 min)
      checkVersion(now);
    };

    document.addEventListener('visibilitychange', refreshOnResume);
    window.addEventListener('focus', refreshOnResume);

    return () => {
      document.removeEventListener('visibilitychange', refreshOnResume);
      window.removeEventListener('focus', refreshOnResume);
    };
  }, [refreshTrackerData]);

  const handleCategoryChange = async () => {
    const cats = await api.getCategories();
    setCategories(cats);
    // Broadcast to other tabs in same browser
    broadcastChange('categories');
  };

  const handleEntryChange = async (optimistic?: { active?: TimeEntry | null; stopped?: TimeEntry }, options?: { skipListRefresh?: boolean }) => {
    if (optimistic) {
      // Apply optimistic update from the API response — no refetch needed
      if (optimistic.active !== undefined) {
        setActiveEntry(optimistic.active);
      }
      const { stopped, active } = optimistic;
      if (stopped) {
        setEntries(prev => {
          const updated = prev.map(e => e.id === stopped.id ? stopped : e);
          if (active && !updated.some(e => e.id === active.id)) {
            return [active, ...updated];
          }
          return updated;
        });
      } else if (active) {
        setEntries(prev =>
          prev.some(e => e.id === active.id) ? prev : [active, ...prev]
        );
      }
      // Signal TimeEntryList to patch its own state without a full reload
      setLastOptimistic(optimistic);
      broadcastChange('time-entries');
      return;
    }
    // Fallback: full refetch for operations without optimistic data (delete, bulk, etc.)
    await fetchAndResolveEntries();
    // Only bump the refresh key if the caller hasn't already refreshed the list
    // (e.g., handleEntryChangeInternal already called loadEntries() before this)
    if (!options?.skipListRefresh) {
      setEntryRefreshKey(k => k + 1);
    }
    broadcastChange('time-entries');
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'tracker', label: 'Track', icon: <ClockIcon size={16} /> },
    { id: 'categories', label: 'Categories', icon: <TagIcon size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <ChartIcon size={16} /> }
  ];

  const autoHideHeader = isMobile && isShortViewport && !headerRevealed;
  const headerIsHidden = (headerHidden && isMobile) || autoHideHeader;

  const renderModal = (title: string, onClose: () => void, children: React.ReactNode) => (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>{title}</h2>
          <button className="settings-modal-close" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>×</button>
        </div>
        <div className="settings-modal-content">{children}</div>
      </div>
    </div>
  );

  return (
    <div className="app">
      {/* Reveal zone: invisible touch target at top of screen to bring header back when auto-hidden */}
      {autoHideHeader && (
        <div
          className="header-reveal-zone"
          onPointerDown={() => setHeaderRevealed(true)}
          aria-label="Tap to show header"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHeaderRevealed(true); }}
        />
      )}
      <header
        className={`app-header${headerIsHidden ? ' header-hidden' : ''}${autoHideHeader ? ' header-collapsed' : ''}`}
        onPointerLeave={() => {
          // Re-hide after user moves away from the revealed header on short viewports
          if (isMobile && isShortViewport && headerRevealed) {
            setHeaderRevealed(false);
          }
        }}
      >
        <div className="header-left" ref={mobileNavRef}>
          {/* Mobile hamburger menu in header */}
          <button 
            className={`hamburger-btn ${showMobileNav ? 'open' : ''}`}
            onClick={() => setShowMobileNav(!showMobileNav)}
            aria-expanded={showMobileNav}
            aria-label="Navigation menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
          <div className={`mobile-nav-panel ${showMobileNav ? 'open' : ''}`}>
            <div className="mobile-nav-content">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  <span className="nav-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
          {showMobileNav && <div className="mobile-nav-overlay" onClick={() => setShowMobileNav(false)} />}
        </div>
        <div className="header-center">
          <div className="logo">
            <LogoIcon />
            <span className="logo-text">ChronoFlow</span>
          </div>
        </div>
        <div className="header-right">
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
                {isLoggedIn && user ? (
                  <div className="settings-dropdown-user">
                    <span className="settings-dropdown-name">{user.name}</span>
                    <span className="settings-dropdown-email">{user.email}</span>
                  </div>
                ) : (
                  <div className="settings-dropdown-user settings-dropdown-guest">
                    <span className="settings-dropdown-name">Guest Mode</span>
                    <span className="settings-dropdown-email">Data stored locally</span>
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
                <div className="settings-dropdown-version">
                  <span>Version {appVersion}</span>
                </div>
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

      {/* Update available banner */}
      {updateAvailable && (
        <div className="timezone-prompt">
          <span>A new version of ChronoFlow is available.</span>
          <div className="timezone-prompt-actions">
            <button className="btn-small btn-primary" onClick={() => window.location.reload()}>
              Refresh
            </button>
            <button className="btn-small btn-ghost" onClick={() => {
              dismissedVersionRef.current = serverVersionRef.current;
              setUpdateAvailable(false);
            }}>
              Later
            </button>
          </div>
        </div>
      )}

      {/* Rate limit warning banner */}
      {rateLimitMsg && (
        <div className="timezone-prompt" role="alert">
          <span>{rateLimitMsg}</span>
          <div className="timezone-prompt-actions">
            <button className="btn-small btn-ghost" onClick={() => setRateLimitMsg(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Desktop navigation */}
      <nav className="app-nav desktop-nav">
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
              categories={categories}
              activeEntry={activeEntry}
              onEntryChange={handleEntryChange}
              onCategoryChange={handleCategoryChange}
              refreshKey={entryRefreshKey}
              lastOptimistic={lastOptimistic}
            />
          </>
        )}
        {activeTab === 'categories' && (
          <CategoryManager
            categories={categories}
            onCategoryChange={handleCategoryChange}
          />
        )}
        {activeTab === 'analytics' && <Analytics refreshKey={entryRefreshKey} />}
      </main>

      {/* Settings Modal */}
      {showSettingsModal && renderModal('Settings', () => setShowSettingsModal(false),
        <Settings onLogout={onLogout} onConvertSuccess={onConvertSuccess} />
      )}

      {/* Help Modal */}
      {showHelpModal && renderModal('Help', () => setShowHelpModal(false),
        <Help />
      )}
    </div>
  );
}

export default function App() {
  const { user, loading, logout, sessionExpired, clearSessionExpired } = useAuth();
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
    clearSessionExpired();
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    setShowLanding(false);
    clearSessionExpired();
  };

  const handleConvertSuccess = () => {
    // Reload to refresh auth state
    window.location.reload();
  };

  // If session expired (logged-in user was logged out unexpectedly), show login with message
  if (sessionExpired && !user) {
    return <Login onBack={handleLoginBack} onSuccess={handleLoginSuccess} sessionExpired={true} />;
  }

  // Show login screen (intentional navigation)
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
