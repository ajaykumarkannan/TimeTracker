import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest, createDefaultCategories } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Get user settings
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.userId as number;

    const result = db.exec(
      `SELECT timezone FROM user_settings WHERE user_id = ?`,
      [userId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      // Return defaults if no settings exist
      return res.json({ timezone: 'UTC' });
    }

    res.json({
      timezone: result[0].values[0][0] as string
    });
  } catch (error) {
    logger.error('Error fetching settings', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.userId as number;
    const { timezone } = req.body;

    // Validate timezone if provided
    if (timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
    }

    // Upsert settings
    const existing = db.exec(
      `SELECT id FROM user_settings WHERE user_id = ?`,
      [userId]
    );

    if (existing.length === 0 || existing[0].values.length === 0) {
      db.run(
        `INSERT INTO user_settings (user_id, timezone) VALUES (?, ?)`,
        [userId, timezone || 'UTC']
      );
    } else {
      db.run(
        `UPDATE user_settings SET timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [timezone || 'UTC', userId]
      );
    }

    saveDatabase();
    logger.info('User settings updated', { userId, timezone });

    res.json({ timezone: timezone || 'UTC' });
  } catch (error) {
    logger.error('Error updating settings', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

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
