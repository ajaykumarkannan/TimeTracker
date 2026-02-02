import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PopOutTimer } from '../PopOutTimer';
import { TimeEntry } from '../../types';

// Mock createPortal to render children directly
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

describe('PopOutTimer', () => {
  const mockActiveEntry: TimeEntry = {
    id: 1,
    category_id: 1,
    category_name: 'Deep Work',
    category_color: '#6366f1',
    note: 'Working on feature',
    start_time: new Date(Date.now() - 3661000).toISOString(), // 1h 1m 1s ago
    end_time: null,
    duration_minutes: null,
    created_at: new Date().toISOString(),
  };

  const mockOnStop = vi.fn();
  const mockOnPause = vi.fn();
  const mockOnClose = vi.fn();

  let mockPopupWindow: {
    document: {
      createElement: ReturnType<typeof vi.fn>;
      body: { appendChild: ReturnType<typeof vi.fn> };
      head: { appendChild: ReturnType<typeof vi.fn> };
      title: string;
      querySelector: ReturnType<typeof vi.fn>;
    };
    close: ReturnType<typeof vi.fn>;
    closed: boolean;
    onbeforeunload: (() => void) | null;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    
    // Create mock popup window
    const mockDiv = document.createElement('div');
    const mockStyle = document.createElement('style');
    
    mockPopupWindow = {
      document: {
        createElement: vi.fn((tag: string) => {
          if (tag === 'div') return mockDiv;
          if (tag === 'style') return mockStyle;
          return document.createElement(tag);
        }),
        body: { appendChild: vi.fn() },
        head: { appendChild: vi.fn() },
        title: '',
        querySelector: vi.fn(() => mockStyle),
      },
      close: vi.fn(),
      closed: false,
      onbeforeunload: null,
    };

    vi.spyOn(window, 'open').mockReturnValue(mockPopupWindow as unknown as Window);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens a popup window on mount', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(window.open).toHaveBeenCalledWith(
      '',
      'chronoflow-timer',
      expect.stringContaining('width=')
    );
  });

  it('calls onClose when popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(mockOnClose).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(
      'Please allow popups for this site to use the pop-out timer.'
    );
  });

  it('sets up onbeforeunload handler to call onClose', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(mockPopupWindow.onbeforeunload).toBeDefined();
    
    // Simulate popup close
    if (mockPopupWindow.onbeforeunload) {
      mockPopupWindow.onbeforeunload();
    }
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes popup window on unmount', () => {
    const { unmount } = render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    unmount();

    expect(mockPopupWindow.close).toHaveBeenCalled();
  });

  it('does not close already closed popup on unmount', () => {
    mockPopupWindow.closed = true;

    const { unmount } = render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    unmount();

    expect(mockPopupWindow.close).not.toHaveBeenCalled();
  });

  it('creates container div in popup document', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(mockPopupWindow.document.createElement).toHaveBeenCalledWith('div');
    expect(mockPopupWindow.document.body.appendChild).toHaveBeenCalled();
  });

  it('injects styles into popup document', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(mockPopupWindow.document.createElement).toHaveBeenCalledWith('style');
    expect(mockPopupWindow.document.head.appendChild).toHaveBeenCalled();
  });

  it('updates popup title with elapsed time', async () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Advance timer to trigger title update
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockPopupWindow.document.title).toMatch(/\d{2}:\d{2}:\d{2} - ChronoFlow/);
  });
});

describe('PopOutTimer time formatting', () => {
  it('formats elapsed time correctly', () => {
    // Test the time formatting logic by checking the title updates
    const mockEntry: TimeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Test',
      category_color: '#000',
      note: null,
      start_time: new Date(Date.now() - 7384000).toISOString(), // 2h 3m 4s ago
      end_time: null,
      duration_minutes: null,
      created_at: new Date().toISOString(),
    };

    vi.useFakeTimers();
    
    const mockDiv = document.createElement('div');
    const mockStyle = document.createElement('style');
    const mockPopup = {
      document: {
        createElement: vi.fn((tag: string) => tag === 'div' ? mockDiv : mockStyle),
        body: { appendChild: vi.fn() },
        head: { appendChild: vi.fn() },
        title: '',
        querySelector: vi.fn(() => mockStyle),
      },
      close: vi.fn(),
      closed: false,
      onbeforeunload: null,
    };

    vi.spyOn(window, 'open').mockReturnValue(mockPopup as unknown as Window);

    render(
      <PopOutTimer
        activeEntry={mockEntry}
        onStop={vi.fn()}
        onPause={vi.fn()}
        onClose={vi.fn()}
        isDarkMode={false}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Title should contain formatted time
    expect(mockPopup.document.title).toContain('02:03:');
    
    vi.useRealTimers();
  });
});
