import { useCallback } from 'react';

/**
 * Thin wrapper around the Web Notifications API for surfacing timer events
 * (e.g. a scheduled stop firing) when the tab is in the background.
 *
 * This is a progressive enhancement — every method degrades gracefully to a
 * no-op when the browser lacks the Notifications API or permission is denied.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API
 */

const NOTIFICATION_ICON = '/favicon.svg';

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Ask the user for permission to show notifications, if we haven't already.
 * Safe to call repeatedly — the browser only prompts once and remembers the
 * choice. Returns true when notifications are permitted afterwards.
 *
 * Call this at a natural opt-in moment (e.g. when the user schedules a stop),
 * not on page load, so the prompt has context.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    // Older Safari used a callback signature that rejects the promise —
    // treat any failure as "not granted".
    return false;
  }
}

/**
 * Show a notification if permission has been granted. No-ops otherwise.
 * Focuses the originating tab when the notification is clicked.
 */
export function notify(title: string, body?: string): void {
  if (!isSupported() || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: NOTIFICATION_ICON,
      // Collapse repeat timer notifications onto a single toast rather than
      // stacking one per fired timer.
      tag: 'chronoflow-timer',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers throw when constructing Notification outside a service
    // worker (notably Android Chrome) — silently ignore.
  }
}

/**
 * Hook exposing the notification helpers with stable identities so they can be
 * used as effect dependencies without re-triggering.
 */
export function useNotifications() {
  const requestPermission = useCallback(requestNotificationPermission, []);
  const sendNotification = useCallback(notify, []);
  return { requestPermission, notify: sendNotification };
}
