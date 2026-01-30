import { useState, useEffect, useCallback } from 'react';

interface IdleDetectionOptions {
  idleTimeout?: number; // ms before considered idle
  warningTimeout?: number; // ms before warning
  onIdle?: () => void;
  onActive?: () => void;
  enabled?: boolean;
}

export function useIdleDetection({
  idleTimeout = 5 * 60 * 1000, // 5 minutes
  warningTimeout = 4 * 60 * 1000, // 4 minutes (1 min warning)
  onIdle,
  onActive,
  enabled = true
}: IdleDetectionOptions = {}) {
  const [isIdle, setIsIdle] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const resetTimer = useCallback(() => {
    setLastActivity(Date.now());
    if (isIdle) {
      setIsIdle(false);
      onActive?.();
    }
    setIsWarning(false);
  }, [isIdle, onActive]);

  useEffect(() => {
    if (!enabled) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimer]);

  useEffect(() => {
    if (!enabled) return;

    const checkIdle = () => {
      const elapsed = Date.now() - lastActivity;
      
      if (elapsed >= idleTimeout && !isIdle) {
        setIsIdle(true);
        setIsWarning(false);
        onIdle?.();
      } else if (elapsed >= warningTimeout && !isWarning && !isIdle) {
        setIsWarning(true);
      }
    };

    const interval = setInterval(checkIdle, 1000);
    return () => clearInterval(interval);
  }, [enabled, lastActivity, idleTimeout, warningTimeout, isIdle, isWarning, onIdle]);

  return {
    isIdle,
    isWarning,
    resetTimer,
    secondsUntilIdle: Math.max(0, Math.floor((idleTimeout - (Date.now() - lastActivity)) / 1000))
  };
}
