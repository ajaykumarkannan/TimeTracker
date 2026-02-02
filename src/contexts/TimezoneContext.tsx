import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../api';

interface TimezoneContextType {
  timezone: string;
  setTimezone: (tz: string) => Promise<void>;
  formatDateTime: (iso: string, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (iso: string) => string;
  formatDate: (iso: string) => string;
  showTimezonePrompt: boolean;
  detectedTimezone: string | null;
  acceptDetectedTimezone: () => void;
  dismissTimezonePrompt: () => void;
}

const TimezoneContext = createContext<TimezoneContextType | null>(null);

export function useTimezone() {
  const context = useContext(TimezoneContext);
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider');
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function TimezoneProvider({ children }: Props) {
  const [timezone, setTimezoneState] = useState<string>(() => {
    // Default to browser timezone initially
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  const [showTimezonePrompt, setShowTimezonePrompt] = useState(false);
  const [detectedTimezone, setDetectedTimezone] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load timezone from server on mount
  useEffect(() => {
    loadTimezone();
  }, []);

  // Check for timezone changes when window gains focus
  useEffect(() => {
    const handleFocus = () => {
      if (loaded) {
        checkTimezoneChange();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loaded, timezone]);

  const loadTimezone = async () => {
    try {
      const settings = await api.getSettings();
      const serverTimezone = settings.timezone;
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // If server has UTC (default) but browser has a different timezone, prompt user
      if (serverTimezone === 'UTC' && browserTimezone !== 'UTC') {
        setTimezoneState(browserTimezone);
        // Auto-save browser timezone as the default
        await api.updateSettings({ timezone: browserTimezone });
      } else {
        setTimezoneState(serverTimezone);
        // Check if browser timezone differs from saved
        if (serverTimezone !== browserTimezone) {
          setDetectedTimezone(browserTimezone);
          setShowTimezonePrompt(true);
        }
      }
    } catch (error) {
      console.error('Failed to load timezone settings:', error);
      // Fall back to browser timezone
      setTimezoneState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
    setLoaded(true);
  };

  const checkTimezoneChange = () => {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimezone !== timezone) {
      setDetectedTimezone(browserTimezone);
      setShowTimezonePrompt(true);
    }
  };

  const setTimezone = useCallback(async (tz: string) => {
    try {
      await api.updateSettings({ timezone: tz });
      setTimezoneState(tz);
      setShowTimezonePrompt(false);
      setDetectedTimezone(null);
    } catch (error) {
      console.error('Failed to update timezone:', error);
      throw error;
    }
  }, []);

  const acceptDetectedTimezone = useCallback(() => {
    if (detectedTimezone) {
      setTimezone(detectedTimezone);
    }
  }, [detectedTimezone, setTimezone]);

  const dismissTimezonePrompt = useCallback(() => {
    setShowTimezonePrompt(false);
    setDetectedTimezone(null);
  }, []);

  const formatDateTime = useCallback((iso: string, options?: Intl.DateTimeFormatOptions) => {
    try {
      const date = new Date(iso);
      return date.toLocaleString(undefined, {
        timeZone: timezone,
        ...options
      });
    } catch {
      return iso;
    }
  }, [timezone]);

  const formatTime = useCallback((iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString(undefined, {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }, [timezone]);

  const formatDate = useCallback((iso: string) => {
    try {
      const date = new Date(iso);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Format dates in the user's timezone for comparison
      const dateStr = date.toLocaleDateString(undefined, { timeZone: timezone });
      const todayStr = today.toLocaleDateString(undefined, { timeZone: timezone });
      const yesterdayStr = yesterday.toLocaleDateString(undefined, { timeZone: timezone });

      if (dateStr === todayStr) return 'Today';
      if (dateStr === yesterdayStr) return 'Yesterday';

      return date.toLocaleDateString(undefined, {
        timeZone: timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return iso;
    }
  }, [timezone]);

  return (
    <TimezoneContext.Provider value={{
      timezone,
      setTimezone,
      formatDateTime,
      formatTime,
      formatDate,
      showTimezonePrompt,
      detectedTimezone,
      acceptDetectedTimezone,
      dismissTimezonePrompt
    }}>
      {children}
    </TimezoneContext.Provider>
  );
}
