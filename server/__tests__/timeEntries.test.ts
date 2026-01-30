import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

let db: Database;
let categoryId: number;
const testUserId = 1;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  
  // Create users table first (required for foreign key)
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
  
  // Create test user
  db.run(`INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
    [testUserId, 'test@example.com', 'testuser', 'hash']);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
  
  db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
  categoryId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0] as number;
});

describe('Time Entries Database', () => {
  it('creates a time entry', () => {
    const now = new Date().toISOString();
    db.run('INSERT INTO time_entries (user_id, category_id, note, start_time) VALUES (?, ?, ?, ?)',
      [testUserId, categoryId, 'Working on feature', now]);
    
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    const stmt = db.prepare('SELECT * FROM time_entries WHERE id = ?');
    stmt.bind([lastId]);
    stmt.step();
    const entry = stmt.getAsObject();
    stmt.free();
    
    expect(entry).toMatchObject({
      user_id: testUserId,
      category_id: categoryId,
      note: 'Working on feature'
    });
  });

  it('calculates duration when stopping entry', () => {
    const startTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    db.run('INSERT INTO time_entries (user_id, category_id, start_time) VALUES (?, ?, ?)',
      [testUserId, categoryId, startTime]);
    
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    const endTime = new Date().toISOString();
    const duration = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
    
    db.run('UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [endTime, duration, id]);
    
    const stmt = db.prepare('SELECT * FROM time_entries WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const entry = stmt.getAsObject() as { duration_minutes: number };
    stmt.free();
    
    expect(entry.duration_minutes).toBeGreaterThan(55);
    expect(entry.duration_minutes).toBeLessThan(65);
  });

  it('retrieves active entry', () => {
    const now = new Date().toISOString();
    db.run('INSERT INTO time_entries (user_id, category_id, start_time) VALUES (?, ?, ?)',
      [testUserId, categoryId, now]);
    
    const stmt = db.prepare('SELECT * FROM time_entries WHERE user_id = ? AND end_time IS NULL LIMIT 1');
    stmt.bind([testUserId]);
    stmt.step();
    const activeEntry = stmt.getAsObject();
    stmt.free();
    
    expect(activeEntry).toBeDefined();
    expect(activeEntry.id).toBeDefined();
  });

  it('can have multiple completed entries', () => {
    const time1 = new Date(Date.now() - 7200000).toISOString();
    const time2 = new Date(Date.now() - 3600000).toISOString();
    const time3 = new Date().toISOString();
    
    db.run('INSERT INTO time_entries (user_id, category_id, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?)',
      [testUserId, categoryId, time1, time2, 60]);
    db.run('INSERT INTO time_entries (user_id, category_id, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?)',
      [testUserId, categoryId, time2, time3, 60]);
    
    const stmt = db.prepare('SELECT * FROM time_entries WHERE user_id = ?');
    stmt.bind([testUserId]);
    const entries = [];
    while (stmt.step()) {
      entries.push(stmt.getAsObject());
    }
    stmt.free();
    
    expect(entries).toHaveLength(2);
  });

  it('deletes time entry', () => {
    const now = new Date().toISOString();
    db.run('INSERT INTO time_entries (user_id, category_id, start_time) VALUES (?, ?, ?)',
      [testUserId, categoryId, now]);
    
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    db.run('DELETE FROM time_entries WHERE id = ?', [id]);
    
    const stmt = db.prepare('SELECT * FROM time_entries WHERE id = ?');
    stmt.bind([id]);
    const hasRow = stmt.step();
    stmt.free();
    
    expect(hasRow).toBe(false);
  });
});
