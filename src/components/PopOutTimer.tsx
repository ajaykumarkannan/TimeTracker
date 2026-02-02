import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TimeEntry } from '../types';
import { getAdaptiveCategoryColors } from '../hooks/useAdaptiveColors';

interface Props {
  activeEntry: TimeEntry;
  onStop: () => void;
  onPause: () => void;
  onClose: () => void;
  isDarkMode: boolean;
}

export function PopOutTimer({ activeEntry, onStop, onPause, onClose, isDarkMode }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [popupWindow, setPopupWindow] = useState<Window | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Calculate elapsed time
  useEffect(() => {
    const updateElapsed = () => {
      const start = new Date(activeEntry.start_time).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    intervalRef.current = window.setInterval(updateElapsed, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeEntry]);

  // Open popup window
  useEffect(() => {
    const width = 320;
    const height = 180;
    const left = window.screenX + window.outerWidth - width - 20;
    const top = window.screenY + 80;

    const popup = window.open(
      '',
      'chronoflow-timer',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );

    if (!popup) {
      alert('Please allow popups for this site to use the pop-out timer.');
      onClose();
      return;
    }

    // Create container in popup
    const div = popup.document.createElement('div');
    div.id = 'popout-root';
    popup.document.body.appendChild(div);
    popup.document.title = 'ChronoFlow Timer';

    // Inject styles
    const style = popup.document.createElement('style');
    style.textContent = getPopupStyles(isDarkMode);
    popup.document.head.appendChild(style);

    // Handle popup close
    popup.onbeforeunload = () => {
      onClose();
    };

    setPopupWindow(popup);
    setContainer(div);

    return () => {
      if (popup && !popup.closed) {
        popup.close();
      }
    };
  }, []);

  // Update styles when theme changes
  useEffect(() => {
    if (popupWindow && !popupWindow.closed) {
      const style = popupWindow.document.querySelector('style');
      if (style) {
        style.textContent = getPopupStyles(isDarkMode);
      }
    }
  }, [isDarkMode, popupWindow]);

  // Update title with elapsed time
  useEffect(() => {
    if (popupWindow && !popupWindow.closed) {
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      popupWindow.document.title = `${timeStr} - ChronoFlow`;
    }
  }, [elapsed, popupWindow]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const colors = getAdaptiveCategoryColors(activeEntry.category_color, isDarkMode);

  if (!container || !popupWindow || popupWindow.closed) {
    return null;
  }

  return createPortal(
    <div className="popout-timer">
      <div className="popout-time">{formatTime(elapsed)}</div>
      <div className="popout-info">
        <span 
          className="popout-category"
          style={{ 
            backgroundColor: colors.bgColor,
            color: colors.textColor
          }}
        >
          <span className="popout-dot" style={{ backgroundColor: colors.dotColor }} />
          {activeEntry.category_name}
        </span>
        {activeEntry.note && (
          <span className="popout-note" title={activeEntry.note}>{activeEntry.note}</span>
        )}
      </div>
      <div className="popout-actions">
        <button className="popout-btn popout-btn-pause" onClick={onPause} title="Pause">
          ❚❚
        </button>
        <button className="popout-btn popout-btn-stop" onClick={onStop} title="Stop">
          ■
        </button>
      </div>
    </div>,
    container
  );
}

function getPopupStyles(isDarkMode: boolean): string {
  const bg = isDarkMode ? '#1a1a2e' : '#ffffff';
  const text = isDarkMode ? '#e2e8f0' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const border = isDarkMode ? '#334155' : '#e2e8f0';
  const btnBg = isDarkMode ? '#334155' : '#f1f5f9';
  const btnHover = isDarkMode ? '#475569' : '#e2e8f0';

  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bg};
      color: ${text};
      overflow: hidden;
      user-select: none;
    }
    .popout-timer {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 16px;
      gap: 12px;
    }
    .popout-time {
      font-size: 42px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 2px;
      color: ${text};
    }
    .popout-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }
    .popout-category {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .popout-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .popout-note {
      font-size: 11px;
      color: ${textMuted};
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .popout-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .popout-btn {
      width: 36px;
      height: 36px;
      border: 1px solid ${border};
      border-radius: 8px;
      background: ${btnBg};
      color: ${text};
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .popout-btn:hover {
      background: ${btnHover};
    }
    .popout-btn-pause:hover {
      border-color: #f59e0b;
      color: #f59e0b;
    }
    .popout-btn-stop:hover {
      border-color: #ef4444;
      color: #ef4444;
    }
  `;
}
