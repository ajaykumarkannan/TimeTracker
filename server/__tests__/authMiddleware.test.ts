import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Response, NextFunction } from 'express';

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn()
  }
}));

vi.mock('../database', () => ({
  getDb: vi.fn(),
  saveDatabase: vi.fn()
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'test-secret'
  }
}));

import jwt from 'jsonwebtoken';
import { getDb } from '../database';
import * as auth from '../middleware/auth';

const signMock = jwt.sign as unknown as ReturnType<typeof vi.fn>;
const verifyMock = jwt.verify as unknown as ReturnType<typeof vi.fn>;
const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

describe('auth middleware helpers', () => {
  beforeEach(() => {
    signMock.mockReset();
    verifyMock.mockReset();
    getDbMock.mockReset();
  });

  it('generates access token with 1h expiry', () => {
    signMock.mockReturnValue('access-token');
    const token = auth.generateAccessToken(1, 'user@example.com');
    expect(token).toBe('access-token');
    expect(signMock).toHaveBeenCalledWith(
      { userId: 1, email: 'user@example.com' },
      'test-secret',
      { expiresIn: '1h' }
    );
  });

  it('generates refresh token with 7d expiry by default', () => {
    signMock.mockReturnValue('refresh-token');
    const token = auth.generateRefreshToken(2, 'refresh@example.com');
    expect(token).toBe('refresh-token');
    expect(signMock).toHaveBeenCalledWith(
      { userId: 2, email: 'refresh@example.com', type: 'refresh' },
      'test-secret',
      { expiresIn: '7d' }
    );
  });

  it('generates refresh token with 30d expiry when rememberMe is true', () => {
    signMock.mockReturnValue('refresh-token-extended');
    const token = auth.generateRefreshToken(2, 'refresh@example.com', true);
    expect(token).toBe('refresh-token-extended');
    expect(signMock).toHaveBeenCalledWith(
      { userId: 2, email: 'refresh@example.com', type: 'refresh' },
      'test-secret',
      { expiresIn: '30d' }
    );
  });

  it('returns payload when token is valid', () => {
    verifyMock.mockReturnValue({ userId: 3, email: 'valid@example.com' });
    const payload = auth.verifyToken('token');
    expect(payload).toEqual({ userId: 3, email: 'valid@example.com' });
  });

  it('returns null when token verification fails', () => {
    verifyMock.mockImplementation(() => {
      throw new Error('invalid');
    });
    const payload = auth.verifyToken('bad-token');
    expect(payload).toBeNull();
  });
});

describe('flexAuthMiddleware', () => {
  beforeEach(() => {
    verifyMock.mockReset();
    getDbMock.mockReset();
  });

  it('accepts valid bearer token', () => {
    verifyMock.mockReturnValue({ userId: 10, email: 'jwt@example.com' });
    const req = {
      headers: { authorization: 'Bearer token' }
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.flexAuthMiddleware(req, res, next);

    expect(req.userId).toBe(10);
    expect(req.userEmail).toBe('jwt@example.com');
    expect(req.isAnonymous).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to anonymous session when no jwt', () => {
    const execMock = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ values: [[42]] }]);
    const runMock = vi.fn();
    getDbMock.mockReturnValue({ exec: execMock, run: runMock });
    const req = {
      headers: { 'x-session-id': 'session-1' }
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.flexAuthMiddleware(req, res, next);

    expect(req.userId).toBe(42);
    expect(req.isAnonymous).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no auth provided', () => {
    const req = { headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.flexAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authMiddleware', () => {
  beforeEach(() => {
    verifyMock.mockReset();
  });

  it('rejects missing authorization header', () => {
    const req = { headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects invalid token', () => {
    verifyMock.mockReturnValue(null);
    const req = { headers: { authorization: 'Bearer bad' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid token and populates request', () => {
    verifyMock.mockReturnValue({ userId: 99, email: 'ok@example.com' });
    const req = { headers: { authorization: 'Bearer ok' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    auth.authMiddleware(req, res, next);

    expect(req.userId).toBe(99);
    expect(req.userEmail).toBe('ok@example.com');
    expect(req.isAnonymous).toBe(false);
    expect(next).toHaveBeenCalled();
  });
});
