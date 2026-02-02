import { useState, useEffect, useRef, useCallback } from 'react';
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
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<number | null>(null);
  const closedByUserRef = useRef(false);

  const colors = getAdaptiveCategoryColors(activeEntry.category_color, isDarkMode);

  const formatTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

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
  }, [activeEntry.start_time]);

  // Render content to popup
  const renderPopupContent = useCallback(() => {
    const popup = popupRef.current;
    if (!popup || popup.closed) return;

    const timeStr = formatTime(elapsed);
    popup.document.title = `${timeStr} - ChronoFlow`;

    const root = popup.document.getElementById('popout-root');
    if (!root) return;

    root.innerHTML = `
      <div class="popout-timer">
        <div class="popout-time">${timeStr}</div>
        <div class="popout-info">
          <span class="popout-category" style="background-color: ${colors.bgColor}; color: ${colors.textColor};">
            <span class="popout-dot" style="background-color: ${colors.dotColor};"></span>
            ${activeEntry.category_name}
          </span>
          ${activeEntry.note ? `<span class="popout-note" title="${activeEntry.note}">${activeEntry.note}</span>` : ''}
        </div>
        <div class="popout-actions">
          <button class="popout-btn popout-btn-pause" id="pause-btn" title="Pause">❚❚</button>
          <button class="popout-btn popout-btn-stop" id="stop-btn" title="Stop">■</button>
        </div>
      </div>
    `;

    // Attach event listeners
    const pauseBtn = popup.document.getElementById('pause-btn');
    const stopBtn = popup.document.getElementById('stop-btn');
    
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        closedByUserRef.current = true;
        onPause();
      };
    }
    if (stopBtn) {
      stopBtn.onclick = () => {
        closedByUserRef.current = true;
        onStop();
      };
    }
  }, [elapsed, colors, activeEntry.category_name, activeEntry.note, formatTime, onPause, onStop]);

  // Open popup window
  useEffect(() => {
    const width = 320;
    const height = 180;
    const left = window.screenX + window.outerWidth - width - 20;
    const top = window.screenY + 80;

    const popup = window.open(
      '',
      'chronoflow-timer-' + Date.now(), // Unique name to allow reopening
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );

    if (!popup) {
      alert('Please allow popups for this site to use the pop-out timer.');
      onClose();
      return;
    }

    popupRef.current = popup;

    // Set up the popup document
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ChronoFlow Timer</title>
          <style>${getPopupStyles(isDarkMode)}</style>
        </head>
        <body>
          <div id="popout-root"></div>
        </body>
      </html>
    `);
    popup.document.close();

    // Handle popup close
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        if (!closedByUserRef.current) {
          onClose();
        }
      }
    }, 200);

    return () => {
      clearInterval(checkClosed);
      if (popup && !popup.closed) {
        popup.close();
      }
      popupRef.current = null;
    };
  }, [isDarkMode, onClose]);

  // Update popup content when elapsed time changes
  useEffect(() => {
    renderPopupContent();
  }, [renderPopupContent]);

  return null; // This component doesn't render anything in the main window
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
