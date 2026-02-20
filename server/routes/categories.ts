import { Router, Response } from 'express';
import { getProvider } from '../database';
import type { Category } from '../data/types';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';
import { broadcastSyncEvent } from './sync';

const router = Router();

// All routes use flexible auth (JWT or anonymous session)
router.use(flexAuthMiddleware);

// Get all categories for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const provider = getProvider();
    const categories = await provider.listCategories(req.userId as number);
    res.json(categories);
  } catch (error) {
    logger.error('Error fetching categories', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const provider = getProvider();
    const category = await provider.createCategory({
      user_id: req.userId as number,
      name,
      color: color || null
    });
    broadcastSyncEvent(req.userId as number, 'categories');
    logger.info('Category created', { categoryId: category.id, userId: req.userId as number });
    res.status(201).json(category);
  } catch (error) {
    logger.error('Error creating category', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const provider = getProvider();
    const existing = await provider.findCategoryById(req.userId as number, Number(id));
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = await provider.updateCategory(req.userId as number, Number(id), {
      name,
      color: color || null
    });
    broadcastSyncEvent(req.userId as number, 'categories');
    logger.info('Category updated', { categoryId: id, userId: req.userId as number });
    res.json(category);
  } catch (error) {
    logger.error('Error updating category', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { replacementCategoryId } = req.body;
    const provider = getProvider();

    const existing = await provider.findCategoryById(req.userId as number, Number(id));
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const totalCategories = await provider.countCategories(req.userId as number);
    const linkedEntries = await provider.countTimeEntriesForCategory(req.userId as number, Number(id));

    if (totalCategories <= 1 && linkedEntries > 0) {
      return res.status(400).json({ error: 'Cannot delete the last category when it has linked entries' });
    }

    if (linkedEntries > 0) {
      if (!replacementCategoryId) {
        return res.status(400).json({ error: 'Replacement category is required' });
      }
      const replacement = await provider.findCategoryById(req.userId as number, Number(replacementCategoryId));
      if (!replacement) {
        return res.status(400).json({ error: 'Replacement category not found' });
      }
      await provider.reassignTimeEntriesCategory(req.userId as number, Number(id), Number(replacementCategoryId));
    }

    await provider.deleteCategory(req.userId as number, Number(id));
    broadcastSyncEvent(req.userId as number, 'all');

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
