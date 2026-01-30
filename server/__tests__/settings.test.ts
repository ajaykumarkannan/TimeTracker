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
  
  // Create test user
  db.run(`INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
    [testUserId, 'test@example.com', 'testuser', 'hash']);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
});

describe('Settings - Reset Data', () => {
  it('deletes all time entries for user', () => {
    // Create a category first
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [testUserId, 'Work', '#007bff']);
    const categoryId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    // Create time entries
    db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
      [testUserId, categoryId, 'Entry 1', '2024-01-01T09:00:00Z', '2024-01-01T10:00:00Z', 60]);
    db.run(`INSERT INTO time_entries (user_id, category_id, note, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
      [testUserId, categoryId, 'Entry 2', '2024-01-01T11:00:00Z', '2024-01-01T12:00:00Z', 60]);
    
    // Verify entries exist
    let result = db.exec(`SELECT COUNT(*) FROM time_entries WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(2);
    
    // Reset - delete time entries
    db.run(`DELETE FROM time_entries WHERE user_id = ?`, [testUserId]);
    
    // Verify entries deleted
    result = db.exec(`SELECT COUNT(*) FROM time_entries WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(0);
  });

  it('deletes all categories for user', () => {
    // Create categories
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [testUserId, 'Work', '#007bff']);
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [testUserId, 'Personal', '#28a745']);
    
    // Verify categories exist
    let result = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(2);
    
    // Reset - delete categories
    db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
    
    // Verify categories deleted
    result = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(0);
  });

  it('recreates default categories after reset', () => {
    // Create and delete categories (simulating reset)
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [testUserId, 'Custom Category', '#ff0000']);
    db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
    
    // Recreate default categories (simulating createDefaultCategories)
    const defaultCategories = [
      { name: 'Meetings', color: '#4CAF50' },
      { name: 'Deep Work', color: '#2196F3' },
      { name: 'Email & Communication', color: '#FF9800' },
      { name: 'Planning', color: '#9C27B0' },
      { name: 'Break', color: '#607D8B' }
    ];
    
    for (const cat of defaultCategories) {
      db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
        [testUserId, cat.name, cat.color]);
    }
    
    // Verify default categories created
    const result = db.exec(`SELECT name, color FROM categories WHERE user_id = ? ORDER BY name`, [testUserId]);
    expect(result[0].values.length).toBe(5);
    
    const names = result[0].values.map(row => row[0]);
    expect(names).toContain('Meetings');
    expect(names).toContain('Deep Work');
    expect(names).toContain('Email & Communication');
    expect(names).toContain('Planning');
    expect(names).toContain('Break');
  });

  it('preserves other users data during reset', () => {
    const otherUserId = 2;
    
    // Create another user
    db.run(`INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
      [otherUserId, 'other@example.com', 'otheruser', 'hash']);
    
    // Create categories for both users
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [testUserId, 'Test User Category', '#007bff']);
    db.run(`INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [otherUserId, 'Other User Category', '#28a745']);
    
    // Reset only test user's data
    db.run(`DELETE FROM time_entries WHERE user_id = ?`, [testUserId]);
    db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
    
    // Verify test user's data is deleted
    let result = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(0);
    
    // Verify other user's data is preserved
    result = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [otherUserId]);
    expect(result[0].values[0][0]).toBe(1);
    
    // Cleanup
    db.run(`DELETE FROM categories WHERE user_id = ?`, [otherUserId]);
    db.run(`DELETE FROM users WHERE id = ?`, [otherUserId]);
  });

  it('handles reset when user has no data', () => {
    // Ensure no data exists
    db.run(`DELETE FROM time_entries WHERE user_id = ?`, [testUserId]);
    db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
    
    // Reset should not throw
    expect(() => {
      db.run(`DELETE FROM time_entries WHERE user_id = ?`, [testUserId]);
      db.run(`DELETE FROM categories WHERE user_id = ?`, [testUserId]);
    }).not.toThrow();
    
    // Verify still empty
    const result = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [testUserId]);
    expect(result[0].values[0][0]).toBe(0);
  });
});
