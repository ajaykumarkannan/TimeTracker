import { Router, Response } from 'express';
import { getDb, saveDatabase, Category } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes use flexible auth (JWT or anonymous session)
router.use(flexAuthMiddleware);

// Get all categories for user
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.exec(
      `SELECT id, user_id, name, color, created_at FROM categories WHERE user_id = ? ORDER BY name`,
      [req.userId as number]
    );

    const categories: Category[] = result.length > 0 
      ? result[0].values.map(row => ({
          id: row[0] as number,
          user_id: row[1] as number,
          name: row[2] as string,
          color: row[3] as string | null,
          created_at: row[4] as string
        }))
      : [];

    res.json(categories);
  } catch (error) {
    logger.error('Error fetching categories', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const db = getDb();
    
    db.run(
      `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
      [req.userId as number, name, color || null]
    );
    saveDatabase();

    const result = db.exec(
      `SELECT id, user_id, name, color, created_at FROM categories WHERE user_id = ? AND name = ?`,
      [req.userId as number, name]
    );

    const category: Category = {
      id: result[0].values[0][0] as number,
      user_id: result[0].values[0][1] as number,
      name: result[0].values[0][2] as string,
      color: result[0].values[0][3] as string | null,
      created_at: result[0].values[0][4] as string
    };

    logger.info('Category created', { categoryId: category.id, userId: req.userId as number });
    res.status(201).json(category);
  } catch (error) {
    logger.error('Error creating category', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const db = getDb();
    
    // Verify ownership
    const existing = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [id, req.userId as number]
    );
    
    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    db.run(
      `UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?`,
      [name, color || null, id, req.userId as number]
    );
    saveDatabase();

    const result = db.exec(
      `SELECT id, user_id, name, color, created_at FROM categories WHERE id = ?`,
      [id]
    );

    const category: Category = {
      id: result[0].values[0][0] as number,
      user_id: result[0].values[0][1] as number,
      name: result[0].values[0][2] as string,
      color: result[0].values[0][3] as string | null,
      created_at: result[0].values[0][4] as string
    };

    logger.info('Category updated', { categoryId: id, userId: req.userId as number });
    res.json(category);
  } catch (error) {
    logger.error('Error updating category', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { replacementCategoryId } = req.body;
    const db = getDb();

    // Verify ownership of category to delete
    const existing = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [id, req.userId as number]
    );
    
    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Count total categories for this user
    const countResult = db.exec(
      `SELECT COUNT(*) FROM categories WHERE user_id = ?`,
      [req.userId as number]
    );
    const totalCategories = countResult[0].values[0][0] as number;

    // Check if there are any time entries linked to this category
    const entriesResult = db.exec(
      `SELECT COUNT(*) FROM time_entries WHERE category_id = ? AND user_id = ?`,
      [id, req.userId as number]
    );
    const linkedEntries = entriesResult[0].values[0][0] as number;

    // Prevent deletion of last category only if there are linked entries
    if (totalCategories <= 1 && linkedEntries > 0) {
      return res.status(400).json({ error: 'Cannot delete the last category when it has linked entries' });
    }

    // Only require replacement if there are linked entries
    if (linkedEntries > 0) {
      if (!replacementCategoryId) {
        return res.status(400).json({ error: 'Replacement category is required' });
      }

      // Verify ownership of replacement category
      const replacementExists = db.exec(
        `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
        [replacementCategoryId, req.userId as number]
      );
      
      if (replacementExists.length === 0 || replacementExists[0].values.length === 0) {
        return res.status(400).json({ error: 'Replacement category not found' });
      }

      // Reassign all time entries to the replacement category
      db.run(
        `UPDATE time_entries SET category_id = ? WHERE category_id = ? AND user_id = ?`,
        [replacementCategoryId, id, req.userId as number]
      );
    }

    // Delete the category
    db.run(`DELETE FROM categories WHERE id = ? AND user_id = ?`, [id, req.userId as number]);
    saveDatabase();

    logger.info('Category deleted', { 
      categoryId: id, 
      replacementCategoryId: linkedEntries > 0 ? replacementCategoryId : null,
      entriesReassigned: linkedEntries,
      userId: req.userId as number 
    });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting category', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
