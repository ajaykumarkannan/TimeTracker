import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppBadge } from '../useAppBadge';

describe('useAppBadge', () => {
  let faviconLink: HTMLLinkElement;
  let appleTouchLink: HTMLLinkElement;

  beforeEach(() => {
    // Set up DOM with favicon and apple-touch-icon links
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.href = '/favicon.svg';
    document.head.appendChild(faviconLink);

    appleTouchLink = document.createElement('link');
    appleTouchLink.rel = 'apple-touch-icon';
    appleTouchLink.href = '/favicon.svg';
    document.head.appendChild(appleTouchLink);

    // Clean up any previous navigator mocks
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
  });

  afterEach(() => {
    // Remove link elements
    faviconLink.remove();
    appleTouchLink.remove();

    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;

    vi.restoreAllMocks();
  });

  // ── Favicon swap tests ────────────────────────────────────────────

  describe('favicon swap (browser tab indicator)', () => {
    it('sets favicon to active variant when tracking is active', () => {
      renderHook(() => useAppBadge(true));

      expect(faviconLink.href).toContain('/favicon-active.svg');
    });

    it('sets favicon to default when tracking is inactive', () => {
      renderHook(() => useAppBadge(false));

      expect(faviconLink.href).toContain('/favicon.svg');
      expect(faviconLink.href).not.toContain('favicon-active');
    });

    it('updates apple-touch-icon when tracking is active', () => {
      renderHook(() => useAppBadge(true));

      expect(appleTouchLink.href).toContain('/favicon-active.svg');
    });

    it('resets apple-touch-icon when tracking stops', () => {
      renderHook(() => useAppBadge(false));

      expect(appleTouchLink.href).toContain('/favicon.svg');
      expect(appleTouchLink.href).not.toContain('favicon-active');
    });

    it('switches favicon from default to active on rerender', () => {
      const { rerender } = renderHook(
        ({ isActive }) => useAppBadge(isActive),
        { initialProps: { isActive: false } }
      );

      expect(faviconLink.href).toContain('/favicon.svg');
      expect(faviconLink.href).not.toContain('favicon-active');

      rerender({ isActive: true });

      expect(faviconLink.href).toContain('/favicon-active.svg');
    });

    it('switches favicon from active back to default on rerender', () => {
      const { rerender } = renderHook(
        ({ isActive }) => useAppBadge(isActive),
        { initialProps: { isActive: true } }
      );

      expect(faviconLink.href).toContain('/favicon-active.svg');

      rerender({ isActive: false });

      expect(faviconLink.href).toContain('/favicon.svg');
      expect(faviconLink.href).not.toContain('favicon-active');
    });

    it('handles missing favicon link gracefully', () => {
      faviconLink.remove();
      appleTouchLink.remove();

      // Should not throw
      expect(() => {
        renderHook(() => useAppBadge(true));
      }).not.toThrow();
    });

    it('handles missing apple-touch-icon gracefully', () => {
      appleTouchLink.remove();

      renderHook(() => useAppBadge(true));

      // Favicon should still be updated
      expect(faviconLink.href).toContain('/favicon-active.svg');
    });
  });

  // ── App Badging API tests ─────────────────────────────────────────

  describe('App Badging API (PWA dock badge)', () => {
    it('calls setAppBadge when tracking is active', () => {
      const setAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });

      renderHook(() => useAppBadge(true));

      expect(setAppBadge).toHaveBeenCalledTimes(1);
      expect(setAppBadge).toHaveBeenCalledWith();
    });

    it('calls clearAppBadge when tracking is inactive', () => {
      const clearAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: clearAppBadge,
        writable: true,
        configurable: true,
      });

      renderHook(() => useAppBadge(false));

      expect(clearAppBadge).toHaveBeenCalledTimes(1);
    });

    it('transitions from setAppBadge to clearAppBadge on stop', () => {
      const setAppBadge = vi.fn().mockResolvedValue(undefined);
      const clearAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: clearAppBadge,
        writable: true,
        configurable: true,
      });

      const { rerender } = renderHook(
        ({ isActive }) => useAppBadge(isActive),
        { initialProps: { isActive: true } }
      );

      expect(setAppBadge).toHaveBeenCalledTimes(1);
      expect(clearAppBadge).not.toHaveBeenCalled();

      rerender({ isActive: false });

      expect(clearAppBadge).toHaveBeenCalledTimes(1);
    });

    it('transitions from clearAppBadge to setAppBadge on start', () => {
      const setAppBadge = vi.fn().mockResolvedValue(undefined);
      const clearAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: clearAppBadge,
        writable: true,
        configurable: true,
      });

      const { rerender } = renderHook(
        ({ isActive }) => useAppBadge(isActive),
        { initialProps: { isActive: false } }
      );

      expect(clearAppBadge).toHaveBeenCalledTimes(1);

      rerender({ isActive: true });

      expect(setAppBadge).toHaveBeenCalledTimes(1);
    });

    it('does not call badge APIs when not supported', () => {
      // navigator.setAppBadge is not defined (default after beforeEach cleanup)
      expect('setAppBadge' in navigator).toBe(false);

      // Should not throw
      expect(() => {
        renderHook(() => useAppBadge(true));
      }).not.toThrow();
    });

    it('silently handles setAppBadge rejection', () => {
      const setAppBadge = vi.fn().mockRejectedValue(new DOMException('Not allowed'));
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });

      // Should not throw even when the API rejects
      expect(() => {
        renderHook(() => useAppBadge(true));
      }).not.toThrow();

      expect(setAppBadge).toHaveBeenCalled();
    });

    it('silently handles clearAppBadge rejection', () => {
      const clearAppBadge = vi.fn().mockRejectedValue(new DOMException('Not allowed'));
      Object.defineProperty(navigator, 'setAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: clearAppBadge,
        writable: true,
        configurable: true,
      });

      expect(() => {
        renderHook(() => useAppBadge(false));
      }).not.toThrow();

      expect(clearAppBadge).toHaveBeenCalled();
    });
  });

  // ── Both approaches together ──────────────────────────────────────

  describe('combined behavior', () => {
    it('updates both favicon and badge when tracking starts', () => {
      const setAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });

      renderHook(() => useAppBadge(true));

      expect(faviconLink.href).toContain('/favicon-active.svg');
      expect(setAppBadge).toHaveBeenCalled();
    });

    it('resets both favicon and badge when tracking stops', () => {
      const clearAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: clearAppBadge,
        writable: true,
        configurable: true,
      });

      renderHook(() => useAppBadge(false));

      expect(faviconLink.href).toContain('/favicon.svg');
      expect(faviconLink.href).not.toContain('favicon-active');
      expect(clearAppBadge).toHaveBeenCalled();
    });

    it('does not re-trigger effects when isActive stays the same', () => {
      const setAppBadge = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'setAppBadge', {
        value: setAppBadge,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clearAppBadge', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      });

      const { rerender } = renderHook(
        ({ isActive }) => useAppBadge(isActive),
        { initialProps: { isActive: true } }
      );

      expect(setAppBadge).toHaveBeenCalledTimes(1);

      // Rerender with same value
      rerender({ isActive: true });

      // Should not call again since the dependency didn't change
      expect(setAppBadge).toHaveBeenCalledTimes(1);
    });
  });
});
