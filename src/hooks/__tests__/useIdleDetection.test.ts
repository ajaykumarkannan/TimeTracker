import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleDetection } from '../useIdleDetection';

describe('useIdleDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial state as not idle', () => {
    const { result } = renderHook(() => useIdleDetection());
    expect(result.current.isIdle).toBe(false);
    expect(result.current.isWarning).toBe(false);
  });

  it('becomes idle after timeout', () => {
    const onIdle = vi.fn();
    const { result } = renderHook(() => 
      useIdleDetection({ idleTimeout: 5000, warningTimeout: 4000, onIdle })
    );

    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5001);
    });

    expect(result.current.isIdle).toBe(true);
    expect(onIdle).toHaveBeenCalled();
  });

  it('shows warning before idle', () => {
    const { result } = renderHook(() => 
      useIdleDetection({ idleTimeout: 5000, warningTimeout: 3000 })
    );

    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(result.current.isWarning).toBe(true);
    expect(result.current.isIdle).toBe(false);
  });

  it('resets timer on activity', () => {
    const onActive = vi.fn();
    const { result } = renderHook(() => 
      useIdleDetection({ idleTimeout: 5000, warningTimeout: 4000, onActive })
    );

    // Become idle first
    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(result.current.isIdle).toBe(true);

    // Reset timer
    act(() => {
      result.current.resetTimer();
    });

    expect(result.current.isIdle).toBe(false);
    expect(result.current.isWarning).toBe(false);
    expect(onActive).toHaveBeenCalled();
  });

  it('does not track when disabled', () => {
    const onIdle = vi.fn();
    const { result } = renderHook(() => 
      useIdleDetection({ idleTimeout: 5000, enabled: false, onIdle })
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.isIdle).toBe(false);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('calculates seconds until idle', () => {
    const { result } = renderHook(() => 
      useIdleDetection({ idleTimeout: 10000 })
    );

    // Initially should be close to 10 seconds
    expect(result.current.secondsUntilIdle).toBeLessThanOrEqual(10);
    expect(result.current.secondsUntilIdle).toBeGreaterThan(0);
  });

  it('uses default timeouts', () => {
    const { result } = renderHook(() => useIdleDetection());
    // Default is 5 minutes = 300 seconds
    expect(result.current.secondsUntilIdle).toBeLessThanOrEqual(300);
  });
});
