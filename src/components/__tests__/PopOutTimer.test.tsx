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
    task_name: 'Working on feature',
    start_time: new Date(Date.now() - 3661000).toISOString(),
    end_time: null,
    duration_minutes: null,
    created_at: new Date().toISOString(),
  };

  const mockOnStop = vi.fn();
  const mockOnPause = vi.fn();
  const mockOnClose = vi.fn();

  let mockPauseBtn: HTMLButtonElement;
  let mockStopBtn: HTMLButtonElement;
  let mockTimerEl: HTMLDivElement;
  let mockPopupWindow: {
    document: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      title: string;
      getElementById: ReturnType<typeof vi.fn>;
    };
    close: ReturnType<typeof vi.fn>;
    closed: boolean;
    chronoflowCleanup?: () => void;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    
    mockTimerEl = document.createElement('div');
    mockTimerEl.id = 'timer';
    mockPauseBtn = document.createElement('button');
    mockPauseBtn.id = 'pauseBtn';
    mockStopBtn = document.createElement('button');
    mockStopBtn.id = 'stopBtn';
    
    mockPopupWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        title: '',
        getElementById: vi.fn((id: string) => {
          if (id === 'timer') return mockTimerEl;
          if (id === 'pauseBtn') return mockPauseBtn;
          if (id === 'stopBtn') return mockStopBtn;
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

  it('writes complete HTML with embedded timer script to popup', () => {
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
    // Should contain embedded JavaScript timer
    expect(writeCall).toContain('<script>');
    expect(writeCall).toContain('setInterval');
    expect(writeCall).toContain('chronoflowCleanup');
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

  it('attaches click event listeners to pause and stop buttons', () => {
    render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Simulate clicking pause button via event listener
    mockPauseBtn.dispatchEvent(new MouseEvent('click'));
    expect(mockOnPause).toHaveBeenCalled();

    // Simulate clicking stop button via event listener
    mockStopBtn.dispatchEvent(new MouseEvent('click'));
    expect(mockOnStop).toHaveBeenCalled();
  });

  it('embeds start time in the popup script', () => {
    const startTime = new Date(mockActiveEntry.start_time).getTime();
    
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
    expect(writeCall).toContain(`var startTime = ${startTime}`);
  });

  it('only runs effect once (empty dependency array)', () => {
    const { rerender } = render(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    expect(window.open).toHaveBeenCalledTimes(1);

    // Rerender with same props
    rerender(
      <PopOutTimer
        activeEntry={mockActiveEntry}
        onStop={mockOnStop}
        onPause={mockOnPause}
        onClose={mockOnClose}
        isDarkMode={false}
      />
    );

    // Should still only have been called once
    expect(window.open).toHaveBeenCalledTimes(1);
  });
});

describe('PopOutTimer without task name', () => {
  it('renders without task name span when entry has no task name', () => {
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

    const entryWithoutTaskName: TimeEntry = {
      id: 1,
      category_id: 1,
      category_name: 'Meeting',
      category_color: '#10b981',
      task_name: null,
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: new Date().toISOString(),
    };

    render(
      <PopOutTimer
        activeEntry={entryWithoutTaskName}
        onStop={vi.fn()}
        onPause={vi.fn()}
        onClose={vi.fn()}
        isDarkMode={false}
      />
    );

    const writeCall = mockPopup.document.write.mock.calls[0][0];
    expect(writeCall).toContain('Meeting');
    // When task_name is null, there should be no span with class="popout-task" in the body
    // The class exists in CSS but the element shouldn't be rendered
    expect(writeCall).not.toContain('class="popout-task"');
    
    vi.useRealTimers();
  });
});

describe('PopOutTimer HTML escaping', () => {
  it('escapes HTML in category name and task name', () => {
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

    const entryWithHtml: TimeEntry = {
      id: 1,
      category_id: 1,
      category_name: '<script>alert("xss")</script>',
      category_color: '#10b981',
      task_name: '<img onerror="alert(1)">',
      start_time: new Date(Date.now() - 60000).toISOString(),
      end_time: null,
      duration_minutes: null,
      created_at: new Date().toISOString(),
    };

    render(
      <PopOutTimer
        activeEntry={entryWithHtml}
        onStop={vi.fn()}
        onPause={vi.fn()}
        onClose={vi.fn()}
        isDarkMode={false}
      />
    );

    const writeCall = mockPopup.document.write.mock.calls[0][0];
    // Should be escaped
    expect(writeCall).toContain('&lt;script&gt;');
    expect(writeCall).toContain('&lt;img');
    // Should NOT contain raw HTML
    expect(writeCall).not.toContain('<script>alert');
    expect(writeCall).not.toContain('<img onerror');
    
    vi.useRealTimers();
  });
});
