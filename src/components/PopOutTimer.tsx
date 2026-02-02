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
  const checkClosedRef = useRef<number | null>(null);
  const closedByUserRef = useRef(false);
  
  // Use refs to avoid re-running effect when callbacks change
  const onPauseRef = useRef(onPause);
  const onStopRef = useRef(onStop);
  const onCloseRef = useRef(onClose);
  
  onPauseRef.current = onPause;
  onStopRef.current = onStop;
  onCloseRef.current = onClose;

  // Memoize values needed for popup - only recalculate when inputs change
  const popupConfig = useRef({
    startTime: activeEntry.start_time,
    categoryName: activeEntry.category_name,
    categoryColor: activeEntry.category_color,
    note: activeEntry.note,
    isDarkMode
  });

  // Open popup window once on mount
  useEffect(() => {
    const config = popupConfig.current;
    const colors = getAdaptiveCategoryColors(config.categoryColor, config.isDarkMode);
    const startTimeMs = new Date(config.startTime).getTime();
    
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
      onCloseRef.current();
      return;
    }

    popupRef.current = popup;

    // Build the complete HTML with embedded timer script
    // The timer runs entirely in the popup window - no React involvement
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>ChronoFlow Timer</title>
  <style>${getPopupStyles(config.isDarkMode)}</style>
</head>
<body>
  <div class="popout-timer">
    <div class="popout-time" id="timer">00:00:00</div>
    <div class="popout-info">
      <span class="popout-category" style="background-color: ${colors.bgColor}; color: ${colors.textColor};">
        <span class="popout-dot" style="background-color: ${colors.dotColor};"></span>
        ${escapeHtml(config.categoryName)}
      </span>
      ${config.note ? `<span class="popout-note" title="${escapeHtml(config.note)}">${escapeHtml(config.note)}</span>` : ''}
    </div>
    <div class="popout-actions">
      <button class="popout-btn popout-btn-pause" id="pauseBtn" title="Pause">❚❚</button>
      <button class="popout-btn popout-btn-stop" id="stopBtn" title="Stop">■</button>
    </div>
  </div>
  <script>
    (function() {
      var startTime = ${startTimeMs};
      var timerEl = document.getElementById('timer');
      var intervalId;
      
      function pad(n) {
        return n < 10 ? '0' + n : n;
      }
      
      function updateTimer() {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        var timeStr = pad(h) + ':' + pad(m) + ':' + pad(s);
        timerEl.textContent = timeStr;
        document.title = timeStr + ' - ChronoFlow';
      }
      
      updateTimer();
      intervalId = setInterval(updateTimer, 1000);
      
      // Expose for cleanup
      window.chronoflowCleanup = function() {
        clearInterval(intervalId);
      };
    })();
  </script>
</body>
</html>`;

    popup.document.write(html);
    popup.document.close();

    // Set up button handlers that call back to parent
    const pauseBtn = popup.document.getElementById('pauseBtn');
    const stopBtn = popup.document.getElementById('stopBtn');
    
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        closedByUserRef.current = true;
        onPauseRef.current();
      });
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        closedByUserRef.current = true;
        onStopRef.current();
      });
    }

    // Check if popup was closed by user (polling is necessary for cross-window)
    checkClosedRef.current = window.setInterval(() => {
      if (popup.closed) {
        if (checkClosedRef.current) clearInterval(checkClosedRef.current);
        if (!closedByUserRef.current) {
          onCloseRef.current();
        }
      }
    }, 500); // Reduced frequency - 500ms is enough

    return () => {
      if (checkClosedRef.current) {
        clearInterval(checkClosedRef.current);
      }
      if (popup && !popup.closed) {
        // Clean up the popup's interval before closing
        try {
          (popup as Window & { chronoflowCleanup?: () => void }).chronoflowCleanup?.();
        } catch {
          // Ignore if popup context is already gone
        }
        popup.close();
      }
      popupRef.current = null;
    };
  }, []); // Empty deps - only run once on mount

  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPopupStyles(isDarkMode: boolean): string {
  const bg = isDarkMode ? '#1a1a2e' : '#ffffff';
  const text = isDarkMode ? '#e2e8f0' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const border = isDarkMode ? '#334155' : '#e2e8f0';
  const btnBg = isDarkMode ? '#334155' : '#f1f5f9';
  const btnHover = isDarkMode ? '#475569' : '#e2e8f0';

  return `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${bg};color:${text};overflow:hidden;user-select:none}
.popout-timer{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:16px;gap:12px}
.popout-time{font-size:42px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:2px}
.popout-info{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:100%}
.popout-category{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:500}
.popout-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.popout-note{font-size:11px;color:${textMuted};max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.popout-actions{display:flex;gap:8px;margin-top:4px}
.popout-btn{width:36px;height:36px;border:1px solid ${border};border-radius:8px;background:${btnBg};color:${text};font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s ease}
.popout-btn:hover{background:${btnHover}}
.popout-btn-pause:hover{border-color:#f59e0b;color:#f59e0b}
.popout-btn-stop:hover{border-color:#ef4444;color:#ef4444}`;
}
