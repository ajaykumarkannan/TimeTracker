import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../database';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('Categories Database', () => {
  beforeEach(() => {
    db.exec('DELETE FROM time_entries');
    db.exec('DELETE FROM categories');
  });

  it('creates a category', () => {
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    expect(result.lastInsertRowid).toBeDefined();
    
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    expect(category).toMatchObject({
      name: 'Development',
      color: '#007bff'
    });
  });

  it('prevents duplicate category names', () => {
    db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    
    expect(() => {
      db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#28a745');
    }).toThrow();
  });

  it('retrieves all categories', () => {
    db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Meetings', '#28a745');
    
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({ name: 'Development' });
    expect(categories[1]).toMatchObject({ name: 'Meetings' });
  });

  it('updates a category', () => {
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    const id = result.lastInsertRowid;
    
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run('Dev Work', '#ff0000', id);
    
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    expect(category).toMatchObject({
      name: 'Dev Work',
      color: '#ff0000'
    });
  });

  it('deletes a category', () => {
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    const id = result.lastInsertRowid;
    
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    expect(category).toBeUndefined();
  });
});
