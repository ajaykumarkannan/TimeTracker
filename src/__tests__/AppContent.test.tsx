import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor, screen } from '@testing-library/react';
import { AppContent } from '../App';
import { api } from '../api';

// Cast the imported API to any so we can use mock methods
const mockApi = api as any;

// Mock the API module
vi.mock('../api', () => ({
  api: {
    getCategories: vi.fn(),
    getRecentEntries: vi.fn(),
    getActiveEntry: vi.fn()
  }
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    logout: vi.fn(),
    sessionExpired: false,
    clearSessionExpired: vi.fn()
  })
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light' })
}));

const useTimezoneMock = vi.fn();

vi.mock('../contexts/TimezoneContext', () => ({
  useTimezone: () => useTimezoneMock()
}));

vi.mock('../components/TimeTracker', () => ({
  TimeTracker: () => <div data-testid="time-tracker" />
}));

vi.mock('../components/TimeEntryList', () => ({
  TimeEntryList: () => <div data-testid="time-entry-list" />
}));

vi.mock('../components/CategoryManager', () => ({
  CategoryManager: () => <div data-testid="category-manager" />
}));

vi.mock('../components/Analytics', () => ({
  Analytics: () => <div data-testid="analytics" />
}));

vi.mock('../components/Settings', () => ({
  Settings: () => <div data-testid="settings" />
}));

vi.mock('../components/Help', () => ({
  Help: () => <div data-testid="help" />
}));

vi.mock('../components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />
}));

vi.mock('../components/Icons', () => ({
  SettingsIcon: () => <span />,
  LogoutIcon: () => <span />,
  HelpIcon: () => <span />,
  ClockIcon: () => <span />,
  TagIcon: () => <span />,
  ChartIcon: () => <span />
}));

// Helper to mock document visibility
const setVisibilityState = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true
  });
};

describe('AppContent refresh behavior', () => {
  let intervalCallbacks: Array<() => void> = [];

  beforeEach(() => {
    setVisibilityState('visible');

    intervalCallbacks = [];
    vi.spyOn(window, 'setInterval').mockImplementation((cb) => {
      intervalCallbacks.push(cb as () => void);
      return 1 as unknown as NodeJS.Timeout;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

    // Resolve mock values for this test run
    mockApi.getCategories.mockResolvedValue([]);
    mockApi.getRecentEntries.mockResolvedValue([]);
    mockApi.getActiveEntry.mockResolvedValue(null);

    useTimezoneMock.mockReturnValue({
      showTimezonePrompt: false,
      detectedTimezone: null,
      acceptDetectedTimezone: vi.fn(),
      dismissTimezonePrompt: vi.fn(),
      timezone: 'UTC'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('refreshes tracker data on interval when visible', async () => {
    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getCategories).toHaveBeenCalled();
      expect(mockApi.getRecentEntries).toHaveBeenCalled();
      expect(mockApi.getActiveEntry).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(intervalCallbacks.length).toBeGreaterThan(0);
    });

    // Clear previous calls before advancing timer
    mockApi.getRecentEntries.mockClear();
    mockApi.getActiveEntry.mockClear();

    await act(async () => {
      intervalCallbacks.forEach((cb) => cb());
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockApi.getRecentEntries).toHaveBeenCalledTimes(1);
      expect(mockApi.getActiveEntry).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes tracker data when tab becomes visible', async () => {
    setVisibilityState('hidden');

    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getCategories).toHaveBeenCalled();
    });

    mockApi.getRecentEntries.mockClear();
    mockApi.getActiveEntry.mockClear();

    setVisibilityState('visible');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(mockApi.getRecentEntries).toHaveBeenCalledTimes(1);
      expect(mockApi.getActiveEntry).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes tracker data on window focus', async () => {
    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockApi.getCategories).toHaveBeenCalled();
    });

    mockApi.getRecentEntries.mockClear();
    mockApi.getActiveEntry.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mockApi.getRecentEntries).toHaveBeenCalledTimes(1);
      expect(mockApi.getActiveEntry).toHaveBeenCalledTimes(1);
    });
  });

  it('opens settings and help modals from the menu', async () => {
    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    const settingsMenuButton = await screen.findByRole('button', { name: 'Settings menu' });
    await act(async () => {
      settingsMenuButton.click();
    });

    await act(async () => {
      screen.getByText('Settings').click();
    });

    expect(await screen.findByTestId('settings')).toBeInTheDocument();

    await act(async () => {
      screen.getByLabelText('Close settings').click();
    });

    await act(async () => {
      settingsMenuButton.click();
    });
    await act(async () => {
      screen.getByText('Help').click();
    });
    expect(await screen.findByTestId('help')).toBeInTheDocument();
  });

  it('switches tabs and persists selection', async () => {
    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    const categoriesTab = screen.getAllByRole('button', { name: 'Categories' })[0];
    await act(async () => {
      categoriesTab.click();
    });

    expect(screen.getByTestId('category-manager')).toBeInTheDocument();
    expect(localStorage.setItem).toHaveBeenCalledWith('chronoflow_tab', 'categories');
  });

  it('shows timezone prompt actions when detected', async () => {
    const acceptDetectedTimezone = vi.fn();
    const dismissTimezonePrompt = vi.fn();
    useTimezoneMock.mockReturnValue({
      showTimezonePrompt: true,
      detectedTimezone: 'America/New_York',
      acceptDetectedTimezone,
      dismissTimezonePrompt,
      timezone: 'UTC'
    });

    render(
      <AppContent
        isLoggedIn={false}
        onLogout={vi.fn()}
        onConvertSuccess={vi.fn()}
      />
    );

    await act(async () => {
      screen.getByText('Update').click();
    });
    await act(async () => {
      screen.getByText('Dismiss').click();
    });

    expect(acceptDetectedTimezone).toHaveBeenCalled();
    expect(dismissTimezonePrompt).toHaveBeenCalled();
  });
});
