import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

let db: Database;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      note TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_minutes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
});

describe('Categories Database', () => {
  it('creates a category', () => {
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#007bff']);
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([lastId]);
    stmt.step();
    const category = stmt.getAsObject();
    stmt.free();
    
    expect(category).toMatchObject({
      name: 'Development',
      color: '#007bff'
    });
  });

  it('prevents duplicate category names', () => {
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#007bff']);
    
    expect(() => {
      db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#28a745']);
    }).toThrow();
  });

  it('retrieves all categories', () => {
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#007bff']);
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Meetings', '#28a745']);
    
    const stmt = db.prepare('SELECT * FROM categories ORDER BY name');
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
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#007bff']);
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
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', ['Development', '#007bff']);
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([id]);
    const hasRow = stmt.step();
    stmt.free();
    
    expect(hasRow).toBe(false);
  });
});
