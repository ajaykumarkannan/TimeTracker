import { useEffect } from 'react';

const FAVICON_DEFAULT = '/favicon.svg';
const FAVICON_ACTIVE = '/favicon-active.svg';

/**
 * Updates the browser tab favicon and PWA dock badge based on tracking state.
 *
 * 1. **Favicon swap** (all browsers): Switches the favicon between the default
 *    clock icon and a variant with a green dot when tracking is active.
 * 2. **App Badging API** (PWA only): Shows a dot badge on the installed PWA's
 *    dock/taskbar icon when tracking is active.
 *
 * Both are progressive enhancements — they degrade gracefully when unsupported.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
 */
export function useAppBadge(isActive: boolean) {
  // Swap favicon for browser tab indicator
  useEffect(() => {
    const href = isActive ? FAVICON_ACTIVE : FAVICON_DEFAULT;

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = href;
    }

    // Also update apple-touch-icon if present
    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleLink) {
      appleLink.href = href;
    }
  }, [isActive]);

  // PWA App Badging API for dock/taskbar
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;

    if (isActive) {
      navigator.setAppBadge().catch(() => {
        // Silently ignore — badge may not be supported in this context
      });
    } else {
      navigator.clearAppBadge().catch(() => {
        // Silently ignore
      });
    }
  }, [isActive]);
}
