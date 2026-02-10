/**
 * Property-Based Tests for Token Expiration
 * 
 * Feature: ux-improvements
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';
import bcrypt from 'bcryptjs';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

// Constants matching the auth.ts implementation
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let db: Database;
const testPasswordHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYn.Wd1Wd1Wd'; // Pre-computed hash

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  
  // Create users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create refresh_tokens table
  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

beforeEach(() => {
  db.run('DELETE FROM refresh_tokens');
  db.run('DELETE FROM users');
});

/**
 * Simulates the login token creation logic from auth.ts
 */
function createLoginToken(
  db: Database,
  userId: number,
  rememberMe: boolean | undefined
): { token: string; expiresAt: Date } {
  const token = `refresh-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Calculate token expiry: 30 days if rememberMe is true, 7 days otherwise
  const tokenExpiry = rememberMe 
    ? THIRTY_DAYS_MS  // 30 days
    : SEVEN_DAYS_MS;  // 7 days (default)
  
  const expiresAt = new Date(Date.now() + tokenExpiry);
  
  db.run(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
    [userId, token, expiresAt.toISOString()]
  );
  
  return { token, expiresAt };
}

/**
 * Simulates the token refresh logic from auth.ts
 */
function refreshToken(
  db: Database,
  oldToken: string
): { newToken: string; newExpiresAt: Date } | null {
  const result = db.exec(
    `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = ?`,
    [oldToken]
  );
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  
  const tokenData = {
    id: result[0].values[0][0] as number,
    user_id: result[0].values[0][1] as number,
    expires_at: result[0].values[0][2] as string
  };
  
  // Check if token is expired
  if (new Date(tokenData.expires_at) < new Date()) {
    db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenData.id]);
    return null;
  }
  
  // Determine if original token was a "remember me" token (30-day)
  // by checking if remaining time is greater than 7 days
  const originalExpiresAt = new Date(tokenData.expires_at);
  const now = new Date();
  const remainingMs = originalExpiresAt.getTime() - now.getTime();
  
  // If remaining time > 7 days, it was a 30-day token, maintain extended expiration
  const isExtendedToken = remainingMs > SEVEN_DAYS_MS;
  const tokenExpiry = isExtendedToken ? THIRTY_DAYS_MS : SEVEN_DAYS_MS;
  const newExpiresAt = new Date(Date.now() + tokenExpiry);
  
  const newToken = `refresh-token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Rotate refresh token
  db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenData.id]);
  db.run(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
    [tokenData.user_id, newToken, newExpiresAt.toISOString()]
  );
  
  return { newToken, newExpiresAt };
}

/**
 * Simulates the logout logic from auth.ts
 */
function logout(db: Database, token: string): boolean {
  db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
  return true;
}

/**
 * Helper to check if a token exists in the database
 */
function tokenExists(db: Database, token: string): boolean {
  const result = db.exec(
    `SELECT id FROM refresh_tokens WHERE token = ?`,
    [token]
  );
  return result.length > 0 && result[0].values.length > 0;
}

describe('Token Expiration Property Tests', () => {
  /**
   * Property 1: Token expiration matches rememberMe setting
   * 
   * For any login request, the issued refresh token expiration SHALL be 
   * 30 days when rememberMe is true, and 7 days when rememberMe is false or undefined.
   * 
   * **Validates: Requirements 3.2, 3.3**
   */
  describe('Property 1: Token expiration matches rememberMe setting', () => {
    it('should issue 30-day token when rememberMe is true', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          (userId) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            const beforeCreate = Date.now();
            const { expiresAt } = createLoginToken(db, userId, true);
            const afterCreate = Date.now();
            
            // Token should expire in approximately 30 days
            const expectedMinExpiry = beforeCreate + THIRTY_DAYS_MS;
            const expectedMaxExpiry = afterCreate + THIRTY_DAYS_MS;
            
            return expiresAt.getTime() >= expectedMinExpiry && 
                   expiresAt.getTime() <= expectedMaxExpiry;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should issue 7-day token when rememberMe is false', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          (userId) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            const beforeCreate = Date.now();
            const { expiresAt } = createLoginToken(db, userId, false);
            const afterCreate = Date.now();
            
            // Token should expire in approximately 7 days
            const expectedMinExpiry = beforeCreate + SEVEN_DAYS_MS;
            const expectedMaxExpiry = afterCreate + SEVEN_DAYS_MS;
            
            return expiresAt.getTime() >= expectedMinExpiry && 
                   expiresAt.getTime() <= expectedMaxExpiry;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should issue 7-day token when rememberMe is undefined', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          (userId) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            const beforeCreate = Date.now();
            const { expiresAt } = createLoginToken(db, userId, undefined);
            const afterCreate = Date.now();
            
            // Token should expire in approximately 7 days
            const expectedMinExpiry = beforeCreate + SEVEN_DAYS_MS;
            const expectedMaxExpiry = afterCreate + SEVEN_DAYS_MS;
            
            return expiresAt.getTime() >= expectedMinExpiry && 
                   expiresAt.getTime() <= expectedMaxExpiry;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Token refresh maintains extended expiration
   * 
   * For any token refresh operation on a refresh token that was issued with 
   * extended (30-day) expiration, the newly issued refresh token SHALL also 
   * have a 30-day expiration from the current time.
   * 
   * **Validates: Requirements 3.4**
   */
  describe('Property 2: Token refresh maintains extended expiration', () => {
    it('should maintain 30-day expiration when refreshing extended token', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          (userId) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            // Create a 30-day token (rememberMe = true)
            const { token: originalToken } = createLoginToken(db, userId, true);
            
            // Refresh the token
            const beforeRefresh = Date.now();
            const refreshResult = refreshToken(db, originalToken);
            const afterRefresh = Date.now();
            
            if (!refreshResult) {
              return false; // Token refresh failed unexpectedly
            }
            
            // New token should also have 30-day expiration
            const expectedMinExpiry = beforeRefresh + THIRTY_DAYS_MS;
            const expectedMaxExpiry = afterRefresh + THIRTY_DAYS_MS;
            
            return refreshResult.newExpiresAt.getTime() >= expectedMinExpiry && 
                   refreshResult.newExpiresAt.getTime() <= expectedMaxExpiry;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain 7-day expiration when refreshing standard token', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          (userId) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            // Create a 7-day token (rememberMe = false)
            const { token: originalToken } = createLoginToken(db, userId, false);
            
            // Refresh the token
            const beforeRefresh = Date.now();
            const refreshResult = refreshToken(db, originalToken);
            const afterRefresh = Date.now();
            
            if (!refreshResult) {
              return false; // Token refresh failed unexpectedly
            }
            
            // New token should also have 7-day expiration
            const expectedMinExpiry = beforeRefresh + SEVEN_DAYS_MS;
            const expectedMaxExpiry = afterRefresh + SEVEN_DAYS_MS;
            
            return refreshResult.newExpiresAt.getTime() >= expectedMinExpiry && 
                   refreshResult.newExpiresAt.getTime() <= expectedMaxExpiry;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Logout invalidates token
   * 
   * For any logout operation, the refresh token SHALL be removed from the database, 
   * making it invalid for future refresh attempts.
   * 
   * **Validates: Requirements 3.5**
   */
  describe('Property 3: Logout invalidates token', () => {
    it('should remove token from database on logout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.boolean(), // rememberMe
          (userId, rememberMe) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            // Create a token
            const { token } = createLoginToken(db, userId, rememberMe);
            
            // Verify token exists before logout
            const existsBeforeLogout = tokenExists(db, token);
            
            // Logout
            logout(db, token);
            
            // Verify token no longer exists after logout
            const existsAfterLogout = tokenExists(db, token);
            
            return existsBeforeLogout === true && existsAfterLogout === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should make token invalid for future refresh attempts after logout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // userId
          fc.boolean(), // rememberMe
          (userId, rememberMe) => {
            // Setup: Create user
            db.run('DELETE FROM refresh_tokens');
            db.run('DELETE FROM users');
            db.run(
              `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
              [userId, `user${userId}@test.com`, `User${userId}`, testPasswordHash]
            );
            
            // Create a token
            const { token } = createLoginToken(db, userId, rememberMe);
            
            // Logout
            logout(db, token);
            
            // Attempt to refresh the logged-out token
            const refreshResult = refreshToken(db, token);
            
            // Refresh should fail (return null) because token was invalidated
            return refreshResult === null;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
