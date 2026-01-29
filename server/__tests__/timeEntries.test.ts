import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../database';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('Time Entries Database', () => {
  let categoryId: number;

  beforeEach(() => {
    db.exec('DELETE FROM time_entries');
    db.exec('DELETE FROM categories');
    
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run('Development', '#007bff');
    categoryId = result.lastInsertRowid as number;
  });

  it('creates a time entry', () => {
    const result = db.prepare(`
      INSERT INTO time_entries (category_id, note, start_time)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(categoryId, 'Working on feature');
    
    expect(result.lastInsertRowid).toBeDefined();
    
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid);
    expect(entry).toMatchObject({
      category_id: categoryId,
      note: 'Working on feature'
    });
  });

  it('calculates duration when stopping entry', () => {
    const result = db.prepare(`
      INSERT INTO time_entries (category_id, start_time)
      VALUES (?, datetime('now', '-1 hour'))
    `).run(categoryId);
    
    const id = result.lastInsertRowid;
    
    db.prepare(`
      UPDATE time_entries 
      SET end_time = CURRENT_TIMESTAMP,
          duration_minutes = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 24 * 60 AS INTEGER)
      WHERE id = ?
    `).run(id);
    
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id) as any;
    expect(entry.duration_minutes).toBeGreaterThan(55);
    expect(entry.duration_minutes).toBeLessThan(65);
  });

  it('retrieves active entry', () => {
    db.prepare(`
      INSERT INTO time_entries (category_id, start_time)
      VALUES (?, CURRENT_TIMESTAMP)
    `).run(categoryId);
    
    const activeEntry = db.prepare(`
      SELECT * FROM time_entries WHERE end_time IS NULL LIMIT 1
    `).get();
    
    expect(activeEntry).toBeDefined();
  });

  it('stops active entries when starting new one', () => {
    db.prepare(`
      INSERT INTO time_entries (category_id, start_time)
      VALUES (?, datetime('now', '-30 minutes'))
    `).run(categoryId);
    
    db.prepare(`
      UPDATE time_entries 
      SET end_time = CURRENT_TIMESTAMP,
          duration_minutes = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 24 * 60 AS INTEGER)
      WHERE end_time IS NULL
    `).run();
    
    db.prepare(`
      INSERT INTO time_entries (category_id, start_time)
      VALUES (?, CURRENT_TIMESTAMP)
    `).run(categoryId);
    
    const activeEntries = db.prepare('SELECT * FROM time_entries WHERE end_time IS NULL').all();
    expect(activeEntries).toHaveLength(1);
  });

  it('cascades delete when category is deleted', () => {
    db.prepare(`
      INSERT INTO time_entries (category_id, start_time)
      VALUES (?, CURRENT_TIMESTAMP)
    `).run(categoryId);
    
    db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
    
    const entries = db.prepare('SELECT * FROM time_entries WHERE category_id = ?').all(categoryId);
    expect(entries).toHaveLength(0);
  });
});
