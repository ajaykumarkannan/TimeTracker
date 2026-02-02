import { useEffect, useRef } from 'react';
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
  const popupRef = useRef<Window | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const closedByUserRef = useRef(false);
  const onPauseRef = useRef(onPause);
  const onStopRef = useRef(onStop);

  // Keep refs updated
  onPauseRef.current = onPause;
  onStopRef.current = onStop;

  const colors = getAdaptiveCategoryColors(activeEntry.category_color, isDarkMode);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Open popup window
  useEffect(() => {
    const width = 320;
    const height = 180;
    const left = window.screenX + window.outerWidth - width - 20;
    const top = window.screenY + 80;

    const popup = window.open(
      '',
      'chronoflow-timer-' + Date.now(),
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );

    if (!popup) {
      alert('Please allow popups for this site to use the pop-out timer.');
      onClose();
      return;
    }

    popupRef.current = popup;

    // Build initial HTML with static content
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ChronoFlow Timer</title>
          <style>${getPopupStyles(isDarkMode)}</style>
        </head>
        <body>
          <div class="popout-timer">
            <div class="popout-time" id="timer-display">00:00:00</div>
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
        </body>
      </html>
    `);
    popup.document.close();

    // Attach event listeners once
    const pauseBtn = popup.document.getElementById('pause-btn');
    const stopBtn = popup.document.getElementById('stop-btn');
    
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        closedByUserRef.current = true;
        onPauseRef.current();
      };
    }
    if (stopBtn) {
      stopBtn.onclick = () => {
        closedByUserRef.current = true;
        onStopRef.current();
      };
    }

    // Get reference to timer display element
    const timerDisplay = popup.document.getElementById('timer-display');
    const startTime = new Date(activeEntry.start_time).getTime();

    // Update only the timer text (like main page does)
    const updateTimer = () => {
      if (!popup || popup.closed || !timerDisplay) return;
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timeStr = formatTime(elapsed);
      
      timerDisplay.textContent = timeStr;
      popup.document.title = `${timeStr} - ChronoFlow`;
    };

    // Initial update
    updateTimer();

    // Start interval - only updates the text content
    timerIntervalRef.current = window.setInterval(updateTimer, 1000);

    // Check if popup was closed by user
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
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (popup && !popup.closed) {
        popup.close();
      }
      popupRef.current = null;
    };
  }, [isDarkMode, onClose, activeEntry.start_time, activeEntry.category_name, activeEntry.note, colors]);

  return null;
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
