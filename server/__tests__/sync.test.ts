import { describe, it, expect, vi } from 'vitest';

// Mock the database
vi.mock('../database', () => ({
  getDb: vi.fn(() => ({
    exec: vi.fn((query: string, params?: unknown[]) => {
      // Mock user lookup by session
      if (query.includes('SELECT id FROM users WHERE session_id')) {
        const sessionId = params?.[0];
        if (sessionId === 'valid-session') {
          return [{ values: [[1]] }];
        }
        return [];
      }
      return [];
    })
  })),
  saveDatabase: vi.fn()
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
