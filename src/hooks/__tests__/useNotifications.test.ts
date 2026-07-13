import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestNotificationPermission, notify } from '../useNotifications';

type MutableNotification = {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
} & ((title: string, options?: NotificationOptions) => unknown);

// Build a mock Notification constructor with a settable static permission.
function installNotification(
  permission: NotificationPermission,
  opts: {
    requestPermission?: () => Promise<NotificationPermission>;
    onConstruct?: (title: string, options?: NotificationOptions) => void;
    throwOnConstruct?: boolean;
  } = {}
) {
  const instances: Array<{ onclick: (() => void) | null; close: () => void }> = [];

  const Ctor = vi.fn(function (this: Record<string, unknown>, title: string, options?: NotificationOptions) {
    if (opts.throwOnConstruct) throw new Error('cannot construct');
    opts.onConstruct?.(title, options);
    const instance = { onclick: null as (() => void) | null, close: vi.fn() };
    instances.push(instance);
    return instance;
  }) as unknown as MutableNotification;

  Ctor.permission = permission;
  Ctor.requestPermission =
    opts.requestPermission ?? vi.fn().mockResolvedValue('granted');

  Object.defineProperty(window, 'Notification', {
    value: Ctor,
    writable: true,
    configurable: true,
  });

  return { Ctor, instances };
}

describe('useNotifications helpers', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).Notification;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).Notification;
    vi.restoreAllMocks();
  });

  describe('requestNotificationPermission', () => {
    it('returns false when the API is unsupported', async () => {
      expect('Notification' in window).toBe(false);
      await expect(requestNotificationPermission()).resolves.toBe(false);
    });

    it('returns true without prompting when already granted', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      installNotification('granted', { requestPermission });

      await expect(requestNotificationPermission()).resolves.toBe(true);
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it('returns false without prompting when already denied', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      installNotification('denied', { requestPermission });

      await expect(requestNotificationPermission()).resolves.toBe(false);
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it('prompts when permission is default and reflects the result', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      installNotification('default', { requestPermission });

      await expect(requestNotificationPermission()).resolves.toBe(true);
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it('returns false when the user dismisses the prompt', async () => {
      const requestPermission = vi.fn().mockResolvedValue('default');
      installNotification('default', { requestPermission });

      await expect(requestNotificationPermission()).resolves.toBe(false);
    });

    it('returns false when requestPermission rejects (legacy Safari)', async () => {
      const requestPermission = vi.fn().mockRejectedValue(new Error('no promise'));
      installNotification('default', { requestPermission });

      await expect(requestNotificationPermission()).resolves.toBe(false);
    });
  });

  describe('notify', () => {
    it('does nothing when the API is unsupported', () => {
      expect(() => notify('Title', 'Body')).not.toThrow();
    });

    it('does not construct a notification when permission is not granted', () => {
      const { Ctor } = installNotification('default');
      notify('Title', 'Body');
      expect(Ctor).not.toHaveBeenCalled();
    });

    it('constructs a notification with body, icon, and tag when granted', () => {
      const onConstruct = vi.fn();
      const { Ctor } = installNotification('granted', { onConstruct });

      notify('Timer ended', 'Your scheduled timer has stopped.');

      expect(Ctor).toHaveBeenCalledTimes(1);
      expect(onConstruct).toHaveBeenCalledWith('Timer ended', {
        body: 'Your scheduled timer has stopped.',
        icon: '/favicon.svg',
        tag: 'chronoflow-timer',
      });
    });

    it('focuses the window and closes the toast when clicked', () => {
      const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
      const { instances } = installNotification('granted');

      notify('Timer ended');

      const instance = instances[0];
      expect(instance.onclick).toBeTypeOf('function');
      instance.onclick?.();

      expect(focusSpy).toHaveBeenCalled();
      expect(instance.close).toHaveBeenCalled();
    });

    it('silently ignores construction failures', () => {
      installNotification('granted', { throwOnConstruct: true });
      expect(() => notify('Timer ended')).not.toThrow();
    });
  });
});
