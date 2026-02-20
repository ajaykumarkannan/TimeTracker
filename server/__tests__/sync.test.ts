import { describe, it, expect, vi } from 'vitest';

// Mock the database
vi.mock('../database', () => ({
  getProvider: vi.fn(() => ({
    findUserByEmail: vi.fn(async (email: string) => {
      if (email === 'anon_valid-session@local') {
        return { id: 1, email };
      }
      return null;
    })
  }))
}));

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock config
vi.mock('../config', () => ({
  config: {
    jwtSecret: 'test-secret',
    nodeEnv: 'test'
  }
}));

import { broadcastSyncEvent } from '../routes/sync';

describe('Sync API', () => {
  describe('broadcastSyncEvent', () => {
    it('does not throw when no clients connected', () => {
      expect(() => broadcastSyncEvent(1, 'time-entries')).not.toThrow();
    });

    it('broadcasts to correct event types', () => {
      // Just verify the function can be called with different types
      expect(() => broadcastSyncEvent(1, 'time-entries')).not.toThrow();
      expect(() => broadcastSyncEvent(1, 'categories')).not.toThrow();
      expect(() => broadcastSyncEvent(1, 'all')).not.toThrow();
    });

    it('handles multiple user IDs', () => {
      expect(() => broadcastSyncEvent(1, 'time-entries')).not.toThrow();
      expect(() => broadcastSyncEvent(2, 'time-entries')).not.toThrow();
      expect(() => broadcastSyncEvent(999, 'categories')).not.toThrow();
    });
  });
});
