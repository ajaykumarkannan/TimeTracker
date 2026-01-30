import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

let db: Database;
const testUserId = 1;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    )
  `);
  
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
  
  db.run(`INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
    [testUserId, 'test@example.com', 'testuser', 'hash']);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
});

describe('Analytics', () => {
  describe('Category Totals', () => {
    it('calculates total minutes by category', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Development', '#007bff']);
      const devId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Meetings', '#28a745']);
      const meetId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      // Add time entries
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, end_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, devId, '2024-01-15T09:00:00Z', '2024-01-15T11:00:00Z', 120]);
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, end_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, meetId, '2024-01-15T14:00:00Z', '2024-01-15T15:00:00Z', 60]);

      const result = db.exec(`
        SELECT c.name, COALESCE(SUM(te.duration_minutes), 0) as minutes
        FROM categories c
        LEFT JOIN time_entries te ON c.id = te.category_id 
          AND te.start_time >= '2024-01-01' AND te.start_time < '2024-02-01'
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY minutes DESC
      `, [testUserId]);

      expect(result[0].values).toHaveLength(2);
      expect(result[0].values[0][0]).toBe('Development');
      expect(result[0].values[0][1]).toBe(120);
      expect(result[0].values[1][0]).toBe('Meetings');
      expect(result[0].values[1][1]).toBe(60);
    });

    it('returns zero for categories with no entries', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Empty Category', '#ff0000']);

      const result = db.exec(`
        SELECT c.name, COALESCE(SUM(te.duration_minutes), 0) as minutes
        FROM categories c
        LEFT JOIN time_entries te ON c.id = te.category_id
        WHERE c.user_id = ?
        GROUP BY c.id
      `, [testUserId]);

      expect(result[0].values[0][1]).toBe(0);
    });
  });

  describe('Daily Totals', () => {
    it('groups entries by date', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Work', '#007bff']);
      const catId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-15T09:00:00Z', 60]);
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-15T14:00:00Z', 30]);
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-16T10:00:00Z', 120]);

      const result = db.exec(`
        SELECT DATE(start_time) as date, SUM(duration_minutes) as minutes
        FROM time_entries
        WHERE user_id = ?
        GROUP BY DATE(start_time)
        ORDER BY date
      `, [testUserId]);

      expect(result[0].values).toHaveLength(2);
      expect(result[0].values[0][0]).toBe('2024-01-15');
      expect(result[0].values[0][1]).toBe(90);
      expect(result[0].values[1][0]).toBe('2024-01-16');
      expect(result[0].values[1][1]).toBe(120);
    });
  });

  describe('Top Notes', () => {
    it('returns most frequent notes', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Work', '#007bff']);
      const catId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, catId, 'Feature work', '2024-01-15T09:00:00Z', 60]);
      db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, catId, 'Feature work', '2024-01-15T14:00:00Z', 30]);
      db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, catId, 'Bug fix', '2024-01-16T10:00:00Z', 120]);

      const result = db.exec(`
        SELECT note, COUNT(*) as count, SUM(duration_minutes) as total_minutes
        FROM time_entries
        WHERE user_id = ? AND note IS NOT NULL AND note != ''
        GROUP BY note
        ORDER BY count DESC
        LIMIT 10
      `, [testUserId]);

      expect(result[0].values).toHaveLength(2);
      expect(result[0].values[0][0]).toBe('Feature work');
      expect(result[0].values[0][1]).toBe(2);
      expect(result[0].values[0][2]).toBe(90);
    });

    it('excludes empty notes', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Work', '#007bff']);
      const catId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, catId, '', '2024-01-15T09:00:00Z', 60]);
      db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?)`,
        [testUserId, catId, null, '2024-01-15T14:00:00Z', 30]);

      const result = db.exec(`
        SELECT note, COUNT(*) as count
        FROM time_entries
        WHERE user_id = ? AND note IS NOT NULL AND note != ''
        GROUP BY note
      `, [testUserId]);

      expect(result).toHaveLength(0);
    });
  });

  describe('Summary Calculations', () => {
    it('calculates average minutes per day', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Work', '#007bff']);
      const catId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      // 3 days with entries
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-15T09:00:00Z', 120]);
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-16T09:00:00Z', 180]);
      db.run(`INSERT INTO time_entries (user_id, category_id, start_time, duration_minutes) 
              VALUES (?, ?, ?, ?)`,
        [testUserId, catId, '2024-01-17T09:00:00Z', 60]);

      const totalResult = db.exec(`
        SELECT SUM(duration_minutes) as total FROM time_entries WHERE user_id = ?
      `, [testUserId]);
      const total = totalResult[0].values[0][0] as number;

      const daysResult = db.exec(`
        SELECT COUNT(DISTINCT DATE(start_time)) as days FROM time_entries WHERE user_id = ?
      `, [testUserId]);
      const days = daysResult[0].values[0][0] as number;

      expect(total).toBe(360);
      expect(days).toBe(3);
      expect(Math.round(total / days)).toBe(120);
    });
  });
});
