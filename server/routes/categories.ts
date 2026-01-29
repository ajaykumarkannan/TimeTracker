import express from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';

const router = express.Router();

// Get all categories
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM categories ORDER BY name');
    const categories = [];
    while (stmt.step()) {
      categories.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(categories);
  } catch (error) {
    logger.error('Error fetching categories', { error });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', (req, res) => {
  const { name, color } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const db = getDb();
    db.run('INSERT INTO categories (name, color) VALUES (?, ?)', [name, color || null]);
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    saveDatabase();
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([lastId]);
    stmt.step();
    const category = stmt.getAsObject();
    stmt.free();
    
    logger.info('Category created', { id: lastId, name });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Category already exists' });
    }
    logger.error('Error creating category', { error });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;

  try {
    const db = getDb();
    db.run('UPDATE categories SET name = ?, color = ? WHERE id = ?', [name, color || null, id]);
    saveDatabase();
    
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const category = stmt.getAsObject();
    stmt.free();
    
    logger.info('Category updated', { id, name });
    res.json(category);
  } catch (error) {
    logger.error('Error updating category', { error, id });
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const db = getDb();
    // Delete associated time entries first (manual cascade)
    db.run('DELETE FROM time_entries WHERE category_id = ?', [id]);
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    saveDatabase();
    
    logger.info('Category deleted', { id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting category', { error, id });
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
