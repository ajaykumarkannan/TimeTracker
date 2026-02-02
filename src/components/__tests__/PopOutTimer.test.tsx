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

  let mockTimerDisplay: HTMLElement;
  let mockPauseBtn: HTMLElement;
  let mockStopBtn: HTMLElement;
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
    
    mockTimerDisplay = document.createElement('div');
    mockTimerDisplay.id = 'timer-display';
    mockPauseBtn = document.createElement('button');
    mockPauseBtn.id = 'pause-btn';
    mockStopBtn = document.createElement('button');
    mockStopBtn.id = 'stop-btn';
    
    mockPopupWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        title: '',
        getElementById: vi.fn((id: string) => {
          if (id === 'timer-display') return mockTimerDisplay;
          if (id === 'pause-btn') return mockPauseBtn;
          if (id === 'stop-btn') return mockStopBtn;
          return null;
        }),
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
    expect(writeCall).toContain('Deep Work');
    expect(writeCall).toContain('Working on feature');
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

  it('updates only the timer display text content', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Initial update should set the timer
    expect(mockTimerDisplay.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);

    // Advance timer
    vi.advanceTimersByTime(1000);

    // Timer should still be updated
    expect(mockTimerDisplay.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
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

  it('attaches click handlers to pause and stop buttons', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Simulate clicking pause button
    mockPauseBtn.onclick?.(new MouseEvent('click'));
    expect(mockOnPause).toHaveBeenCalled();

    // Simulate clicking stop button
    mockStopBtn.onclick?.(new MouseEvent('click'));
    expect(mockOnStop).toHaveBeenCalled();
  });
});

describe('PopOutTimer without note', () => {
  it('renders without note span when entry has no note', () => {
    vi.useFakeTimers();
    
    const mockPopup = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        title: '',
        getElementById: vi.fn(() => document.createElement('div')),
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

    const writeCall = mockPopup.document.write.mock.calls[0][0];
    expect(writeCall).toContain('Meeting');
    // When note is null, the note span should not be rendered
    // The template uses conditional: ${activeEntry.note ? `<span class="popout-note"...` : ''}
    // So we check that the note title attribute is not present
    expect(writeCall).not.toContain('title="null"');
    
    vi.useRealTimers();
  });
});
