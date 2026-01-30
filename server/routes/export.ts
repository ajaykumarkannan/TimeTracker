import { Router, Response } from 'express';
import { getDb } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userId = req.userId as number;

    // Get all categories
    const categoriesResult = db.exec(`
      SELECT id, name, color, created_at
      FROM categories
      WHERE user_id = ?
      ORDER BY name
    `, [userId]);

    const categories = categoriesResult.length > 0
      ? categoriesResult[0].values.map(row => ({
          id: row[0] as number,
          name: row[1] as string,
          color: row[2] as string | null,
          created_at: row[3] as string
        }))
      : [];

    // Get all time entries
    const entriesResult = db.exec(`
      SELECT te.id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ?
      ORDER BY te.start_time DESC
    `, [userId]);

    const timeEntries = entriesResult.length > 0
      ? entriesResult[0].values.map(row => ({
          id: row[0] as number,
          category_id: row[1] as number,
          category_name: row[2] as string,
          category_color: row[3] as string | null,
          note: row[4] as string | null,
          start_time: row[5] as string,
          end_time: row[6] as string | null,
          duration_minutes: row[7] as number | null,
          created_at: row[8] as string
        }))
      : [];

    logger.info('Data exported', { userId, categories: categories.length, entries: timeEntries.length });

    res.json({
      exportedAt: new Date().toISOString(),
      categories,
      timeEntries
    });
  } catch (error) {
    logger.error('Error exporting data', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
