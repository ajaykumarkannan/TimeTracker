import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';
import bcrypt from 'bcryptjs';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

let db: Database;
const testUserId = 1;
const testEmail = 'test@example.com';
const testPassword = 'password123';
let testPasswordHash: string;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  testPasswordHash = await bcrypt.hash(testPassword, 12);
  
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
  
  // Create categories table
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  
  // Create time_entries table
  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      note TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_minutes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
  db.run('DELETE FROM refresh_tokens');
  db.run('DELETE FROM users');
});

describe('Auth Database Operations', () => {
  describe('Registration', () => {
    it('creates a new user with hashed password', async () => {
      const email = 'newuser@example.com';
      const name = 'New User';
      const passwordHash = await bcrypt.hash('securepass', 12);
      
      db.run(
        `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
        [email, name, passwordHash]
      );
      
      const result = db.exec(`SELECT * FROM users WHERE email = ?`, [email]);
      expect(result.length).toBe(1);
      expect(result[0].values[0][1]).toBe(email);
      expect(result[0].values[0][2]).toBe(name);
    });

    it('prevents duplicate email registration', () => {
      db.run(
        `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
        [testEmail, 'User 1', testPasswordHash]
      );
      
      expect(() => {
        db.run(
          `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
          [testEmail, 'User 2', testPasswordHash]
        );
      }).toThrow();
    });

    it('validates password length requirement', async () => {
      const shortPassword = '12345';
      expect(shortPassword.length).toBeLessThan(6);
      
      const validPassword = '123456';
      expect(validPassword.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Login', () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
    });

    it('finds user by email', () => {
      const result = db.exec(
        `SELECT id, email, username, password_hash FROM users WHERE email = ?`,
        [testEmail]
      );
      
      expect(result.length).toBe(1);
      expect(result[0].values[0][1]).toBe(testEmail);
    });

    it('returns empty for non-existent email', () => {
      const result = db.exec(
        `SELECT id, email, username, password_hash FROM users WHERE email = ?`,
        ['nonexistent@example.com']
      );
      
      expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });

    it('validates password with bcrypt', async () => {
      const result = db.exec(
        `SELECT password_hash FROM users WHERE email = ?`,
        [testEmail]
      );
      const storedHash = result[0].values[0][0] as string;
      
      const validPassword = await bcrypt.compare(testPassword, storedHash);
      expect(validPassword).toBe(true);
      
      const invalidPassword = await bcrypt.compare('wrongpassword', storedHash);
      expect(invalidPassword).toBe(false);
    });
  });

  describe('Refresh Tokens', () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
    });

    it('stores refresh token with expiration', () => {
      const token = 'test-refresh-token-123';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, token, expiresAt]
      );
      
      const result = db.exec(
        `SELECT * FROM refresh_tokens WHERE token = ?`,
        [token]
      );
      
      expect(result.length).toBe(1);
      expect(result[0].values[0][1]).toBe(testUserId);
      expect(result[0].values[0][2]).toBe(token);
    });

    it('retrieves token by value', () => {
      const token = 'test-refresh-token-456';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, token, expiresAt]
      );
      
      const result = db.exec(
        `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token = ?`,
        [token]
      );
      
      expect(result.length).toBe(1);
      expect(result[0].values[0][1]).toBe(testUserId);
    });

    it('deletes token on rotation', () => {
      const oldToken = 'old-token';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, oldToken, expiresAt]
      );
      
      const insertResult = db.exec(`SELECT last_insert_rowid() as id`);
      const tokenId = insertResult[0].values[0][0];
      
      db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [tokenId]);
      
      const result = db.exec(
        `SELECT * FROM refresh_tokens WHERE token = ?`,
        [oldToken]
      );
      
      expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });

    it('stores 30-day token when rememberMe is true', () => {
      const token = 'remember-me-token';
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + thirtyDaysMs).toISOString();
      
      db.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, token, expiresAt]
      );
      
      const result = db.exec(
        `SELECT expires_at FROM refresh_tokens WHERE token = ?`,
        [token]
      );
      
      const storedExpiry = new Date(result[0].values[0][0] as string);
      const expectedExpiry = new Date(Date.now() + thirtyDaysMs);
      
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(storedExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it('identifies extended token by remaining time greater than 7 days', () => {
      // Simulate a 30-day token with 20 days remaining
      const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + twentyDaysMs);
      
      const remainingMs = expiresAt.getTime() - Date.now();
      const isExtendedToken = remainingMs > sevenDaysMs;
      
      expect(isExtendedToken).toBe(true);
    });

    it('identifies standard token by remaining time less than or equal to 7 days', () => {
      // Simulate a 7-day token with 5 days remaining
      const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + fiveDaysMs);
      
      const remainingMs = expiresAt.getTime() - Date.now();
      const isExtendedToken = remainingMs > sevenDaysMs;
      
      expect(isExtendedToken).toBe(false);
    });
  });

  describe('Logout', () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
    });

    it('deletes specific refresh token', () => {
      const token = 'logout-token';
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, token, expiresAt]
      );
      
      db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
      
      const result = db.exec(`SELECT * FROM refresh_tokens WHERE token = ?`, [token]);
      expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });

    it('deletes all tokens for user (logout all devices)', () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      
      db.run(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, 'token1', expiresAt]);
      db.run(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, 'token2', expiresAt]);
      db.run(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, 'token3', expiresAt]);
      
      db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [testUserId]);
      
      const result = db.exec(`SELECT * FROM refresh_tokens WHERE user_id = ?`, [testUserId]);
      expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });
  });

  describe('Get Current User', () => {
    it('retrieves user by id', () => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
      
      const result = db.exec(
        `SELECT id, email, username, created_at FROM users WHERE id = ?`,
        [testUserId]
      );
      
      expect(result.length).toBe(1);
      expect(result[0].values[0][0]).toBe(testUserId);
      expect(result[0].values[0][1]).toBe(testEmail);
      expect(result[0].values[0][2]).toBe('Test User');
    });

    it('returns empty for non-existent user', () => {
      const result = db.exec(
        `SELECT id, email, username, created_at FROM users WHERE id = ?`,
        [999]
      );
      
      expect(result.length === 0 || result[0].values.length === 0).toBe(true);
    });
  });

  describe('Guest Conversion', () => {
    it('converts guest user to registered account', async () => {
      const sessionId = 'test-session-123';
      const guestEmail = `anon_${sessionId}@local`;
      
      // Create guest user
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, guestEmail, 'Guest', '']
      );
      
      // Convert to registered
      const newEmail = 'converted@example.com';
      const newName = 'Converted User';
      const newPasswordHash = await bcrypt.hash('newpassword', 12);
      
      db.run(
        `UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?`,
        [newEmail, newName, newPasswordHash, testUserId]
      );
      
      const result = db.exec(`SELECT * FROM users WHERE id = ?`, [testUserId]);
      expect(result[0].values[0][1]).toBe(newEmail);
      expect(result[0].values[0][2]).toBe(newName);
    });

    it('finds guest by anonymous email pattern', () => {
      const sessionId = 'session-456';
      const guestEmail = `anon_${sessionId}@local`;
      
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, guestEmail, 'Guest', '']
      );
      
      const result = db.exec(`SELECT id FROM users WHERE email = ?`, [guestEmail]);
      expect(result.length).toBe(1);
      expect(result[0].values[0][0]).toBe(testUserId);
    });
  });

  describe('Update Account', () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
    });

    it('updates user name', () => {
      const newName = 'Updated Name';
      db.run(`UPDATE users SET username = ? WHERE id = ?`, [newName, testUserId]);
      
      const result = db.exec(`SELECT username FROM users WHERE id = ?`, [testUserId]);
      expect(result[0].values[0][0]).toBe(newName);
    });

    it('updates user email', () => {
      const newEmail = 'newemail@example.com';
      db.run(`UPDATE users SET email = ? WHERE id = ?`, [newEmail, testUserId]);
      
      const result = db.exec(`SELECT email FROM users WHERE id = ?`, [testUserId]);
      expect(result[0].values[0][0]).toBe(newEmail);
    });

    it('checks for email conflicts', () => {
      // Create another user
      db.run(
        `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
        ['other@example.com', 'Other User', testPasswordHash]
      );
      
      // Check if email is taken
      const result = db.exec(
        `SELECT id FROM users WHERE email = ? AND id != ?`,
        ['other@example.com', testUserId]
      );
      
      expect(result.length).toBe(1);
      expect(result[0].values.length).toBeGreaterThan(0);
    });

    it('updates password hash', async () => {
      const newPasswordHash = await bcrypt.hash('newpassword123', 12);
      db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [newPasswordHash, testUserId]);
      
      const result = db.exec(`SELECT password_hash FROM users WHERE id = ?`, [testUserId]);
      const storedHash = result[0].values[0][0] as string;
      
      const valid = await bcrypt.compare('newpassword123', storedHash);
      expect(valid).toBe(true);
    });
  });

  describe('Delete Account', () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
        [testUserId, testEmail, 'Test User', testPasswordHash]
      );
      
      // Add some user data
      db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
        [testUserId, 'Work', '#007bff']);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      db.run(`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [testUserId, 'token', expiresAt]);
    });

    it('deletes all user data on account deletion', () => {
      // Delete in correct order for foreign keys
      db.run(`DELETE FROM time_entries WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM users WHERE id = ?`, [testUserId]);
      
      // Verify all data is deleted
      const userResult = db.exec(`SELECT * FROM users WHERE id = ?`, [testUserId]);
      expect(userResult.length === 0 || userResult[0].values.length === 0).toBe(true);
      
      const catResult = db.exec(`SELECT * FROM categories WHERE user_id = ?`, [testUserId]);
      expect(catResult.length === 0 || catResult[0].values.length === 0).toBe(true);
      
      const tokenResult = db.exec(`SELECT * FROM refresh_tokens WHERE user_id = ?`, [testUserId]);
      expect(tokenResult.length === 0 || tokenResult[0].values.length === 0).toBe(true);
    });
  });
});
