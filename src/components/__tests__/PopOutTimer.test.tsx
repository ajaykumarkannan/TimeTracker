import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { PopOutTimer } from '../PopOutTimer';
import { TimeEntry } from '../../types';

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
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      title: string;
      getElementById: ReturnType<typeof vi.fn>;
    };
    close: ReturnType<typeof vi.fn>;
    closed: boolean;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    
    const mockRoot = document.createElement('div');
    mockRoot.id = 'popout-root';
    
    mockPopupWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        title: '',
        getElementById: vi.fn(() => mockRoot),
      },
      close: vi.fn(),
      closed: false,
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
      expect.stringContaining('chronoflow-timer-'),
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

  it('writes HTML content to popup document', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(mockPopupWindow.document.write).toHaveBeenCalled();
    const writeCall = mockPopupWindow.document.write.mock.calls[0][0];
    expect(writeCall).toContain('<!DOCTYPE html>');
    expect(writeCall).toContain('ChronoFlow Timer');
    expect(writeCall).toContain('popout-root');
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

  it('renders timer content with category and note', () => {
    const mockRoot = document.createElement('div');
    mockRoot.id = 'popout-root';
    mockPopupWindow.document.getElementById = vi.fn(() => mockRoot);

    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Advance timer to trigger content render
    vi.advanceTimersByTime(1000);

    expect(mockRoot.innerHTML).toContain('Deep Work');
    expect(mockRoot.innerHTML).toContain('Working on feature');
  });

  it('updates popup title with elapsed time', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    vi.advanceTimersByTime(1000);

    expect(mockPopupWindow.document.title).toMatch(/\d{2}:\d{2}:\d{2} - ChronoFlow/);
  });

  it('uses unique window name to allow reopening', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    const openCall = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(openCall[1]).toMatch(/^chronoflow-timer-\d+$/);
  });

  it('applies dark mode styles when isDarkMode is true', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={true}
      />
    );

    const writeCall = mockPopupWindow.document.write.mock.calls[0][0];
    expect(writeCall).toContain('#1a1a2e'); // Dark mode background
  });

  it('applies light mode styles when isDarkMode is false', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    const writeCall = mockPopupWindow.document.write.mock.calls[0][0];
    expect(writeCall).toContain('#ffffff'); // Light mode background
  });
});

describe('PopOutTimer without note', () => {
  it('renders without note when entry has no note', () => {
    vi.useFakeTimers();
    
    const mockRoot = document.createElement('div');
    mockRoot.id = 'popout-root';
    
    const mockPopup = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        title: '',
        getElementById: vi.fn(() => mockRoot),
      },
      close: vi.fn(),
      closed: false,
    };

    vi.spyOn(window, 'open').mockReturnValue(mockPopup as unknown as Window);

    const entryWithoutNote: TimeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Meeting',
      category_color: '#10b981',
      note: null,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: new Date().toISOString(),
    };

    render(
      <PopOutTimer
        activeEntry={entryWithoutNote}
        onStop={vi.fn()}
        onPause={vi.fn()}
        onClose={vi.fn()}
        isDarkMode={false}
      />
    );

    vi.advanceTimersByTime(1000);

    expect(mockRoot.innerHTML).toContain('Meeting');
    expect(mockRoot.innerHTML).not.toContain('popout-note');
    
    vi.useRealTimers();
  });
});
