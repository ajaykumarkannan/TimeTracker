import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

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

import syncRouter, { broadcastSyncEvent } from '../routes/sync';

describe('Sync API', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sync', syncRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/sync', () => {
    it('returns 401 without authentication', async () => {
      const response = await request(app).get('/api/sync');
      expect(response.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/sync?token=invalid-token');
      expect(response.status).toBe(401);
    });

    it('returns 401 with invalid session', async () => {
      const response = await request(app)
        .get('/api/sync?sessionId=invalid-session');
      expect(response.status).toBe(401);
    });

    it('establishes SSE connection with valid JWT token', async () => {
      const token = jwt.sign({ userId: 1 }, 'test-secret');
      
      const response = await request(app)
        .get(`/api/sync?token=${token}`)
        .set('Accept', 'text/event-stream');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('establishes SSE connection with valid session ID', async () => {
      const response = await request(app)
        .get('/api/sync?sessionId=valid-session')
        .set('Accept', 'text/event-stream');
      
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });

  describe('GET /api/sync/status', () => {
    it('returns connection status', async () => {
      const token = jwt.sign({ userId: 1 }, 'test-secret');
      
      const response = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalClients');
      expect(response.body).toHaveProperty('userClients');
      expect(response.body).toHaveProperty('eventCounter');
    });
  });

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
  });
});
