import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest, createDefaultCategories } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Reset all user data
router.post('/reset', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.userId as number;

    // Delete all time entries
    db.run(`DELETE FROM time_entries WHERE user_id = ?`, [userId]);
    
    // Delete all categories
    db.run(`DELETE FROM categories WHERE user_id = ?`, [userId]);
    
    // Recreate default categories
    createDefaultCategories(userId);
    
    saveDatabase();

    logger.info('User data reset', { userId });
    res.json({ message: 'Data reset successfully' });
  } catch (error) {
    logger.error('Error resetting data', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

export default router;
