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
});

describe('Categories Database', () => {
  it('creates a category', () => {
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([lastId]);
    stmt.step();
    const category = stmt.getAsObject();
    stmt.free();
    
    expect(category).toMatchObject({
      user_id: testUserId,
      name: 'Development',
      color: '#007bff'
    });
  });

  it('prevents duplicate category names for same user', () => {
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
    
    expect(() => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#28a745']);
    }).toThrow();
  });

  it('retrieves all categories for a user', () => {
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Meetings', '#28a745']);
    
    const stmt = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name');
    stmt.bind([testUserId]);
    const categories = [];
    while (stmt.step()) {
      categories.push(stmt.getAsObject());
    }
    stmt.free();
    
    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({ name: 'Development' });
    expect(categories[1]).toMatchObject({ name: 'Meetings' });
  });

  it('updates a category', () => {
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    db.run('UPDATE categories SET name = ?, color = ? WHERE id = ?', ['Dev Work', '#ff0000', id]);
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const category = stmt.getAsObject();
    stmt.free();
    
    expect(category).toMatchObject({
      name: 'Dev Work',
      color: '#ff0000'
    });
  });

  it('deletes a category', () => {
    db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', [testUserId, 'Development', '#007bff']);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([id]);
    const hasRow = stmt.step();
    stmt.free();
    
    expect(hasRow).toBe(false);
  });
});
