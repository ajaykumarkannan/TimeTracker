import express from 'express';
import { db } from '../database';
import { logger } from '../logger';

const router = express.Router();

// Get all categories
router.get('/', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
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
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(name, color || null);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    logger.info('Category created', { id: result.lastInsertRowid, name });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT') {
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
    db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(name, color || null, id);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
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
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    logger.info('Category deleted', { id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting category', { error, id });
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
