import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const authState = {
  user: null as { id: number; email: string; name: string } | null,
  loading: false,
  logout: vi.fn(async () => undefined),
  sessionExpired: false,
  clearSessionExpired: vi.fn()
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../api', () => ({
  api: {
    getCategories: vi.fn().mockResolvedValue([]),
    getRecentEntries: vi.fn().mockResolvedValue([]),
    getActiveEntry: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('../contexts/TimezoneContext', () => ({
  TimezoneProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTimezone: () => ({
    showTimezonePrompt: false,
    detectedTimezone: null,
    acceptDetectedTimezone: vi.fn(),
    dismissTimezonePrompt: vi.fn(),
    timezone: 'UTC'
  })
}));

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ resolvedTheme: 'light' })
}));

vi.mock('../components/Landing', () => ({
  Landing: ({ onLogin, onGuest }: { onLogin: () => void; onGuest: () => void }) => (
    <div>
      <button onClick={onLogin}>go login</button>
      <button onClick={onGuest}>guest</button>
    </div>
  )
}));

vi.mock('../components/Login', () => ({
  Login: ({ onBack, onSuccess, sessionExpired }: { onBack: () => void; onSuccess?: () => void; sessionExpired?: boolean }) => (
    <div>
      <span>{sessionExpired ? 'login-expired' : 'login-normal'}</span>
      <button onClick={onBack}>back</button>
      <button onClick={onSuccess}>success</button>
    </div>
  )
}));

vi.mock('../App', async () => {
  const actual = await vi.importActual<typeof import('../App')>('../App');
  return actual;
});

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

import App from '../App';

describe('App', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    authState.sessionExpired = false;
    authState.logout.mockClear();
    authState.clearSessionExpired.mockClear();
    const getItemMock = localStorage.getItem as unknown as ReturnType<typeof vi.fn>;
    getItemMock?.mockReturnValue(null);
  });

  it('shows loading state when auth is loading', () => {
    authState.loading = true;
    render(<App />);
    expect(screen.getByText('Loading ChronoFlow...')).toBeInTheDocument();
  });

  it('shows login screen when session expired', () => {
    authState.sessionExpired = true;
    render(<App />);
    expect(screen.getByText('login-expired')).toBeInTheDocument();
  });

  it('navigates from landing to login and then app content', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('go login'));
    });
    expect(screen.getByText('login-normal')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('success'));
    });

    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('time-entry-list')).toBeInTheDocument();
  });

  it('continues as guest from landing', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('guest'));
    });

    expect(screen.getByTestId('time-tracker')).toBeInTheDocument();
  });
});
