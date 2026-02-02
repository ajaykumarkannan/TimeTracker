import { Router, Response } from 'express';
import { getDb } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const db = getDb();
    const userId = req.userId as number;

    // Get totals by category
    const categoryResult = db.exec(`
      SELECT c.name, c.color, 
             COALESCE(SUM(te.duration_minutes), 0) as minutes,
             COUNT(te.id) as count
      FROM categories c
      LEFT JOIN time_entries te ON c.id = te.category_id 
        AND te.start_time >= ? AND te.start_time < ?
        AND te.user_id = ?
      WHERE c.user_id = ?
      GROUP BY c.id, c.name, c.color
      ORDER BY minutes DESC
    `, [start, end, userId, userId]);

    const byCategory = categoryResult.length > 0
      ? categoryResult[0].values.map(row => ({
          name: row[0] as string,
          color: row[1] as string || '#6b7280',
          minutes: row[2] as number,
          count: row[3] as number
        }))
      : [];

    // Get daily totals
    const dailyResult = db.exec(`
      SELECT DATE(start_time) as date, 
             COALESCE(SUM(duration_minutes), 0) as minutes
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ?
      GROUP BY DATE(start_time)
      ORDER BY date
    `, [userId, start, end]);

    // Get daily breakdown by category
    const dailyByCategoryResult = db.exec(`
      SELECT DATE(te.start_time) as date, c.name, COALESCE(SUM(te.duration_minutes), 0) as minutes
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ?
      GROUP BY DATE(te.start_time), c.name
      ORDER BY date, minutes DESC
    `, [userId, start, end]);

    // Build a map of date -> { categoryName: minutes }
    const dailyByCategoryMap: Record<string, Record<string, number>> = {};
    if (dailyByCategoryResult.length > 0) {
      for (const row of dailyByCategoryResult[0].values) {
        const date = row[0] as string;
        const categoryName = row[1] as string;
        const minutes = row[2] as number;
        if (!dailyByCategoryMap[date]) {
          dailyByCategoryMap[date] = {};
        }
        dailyByCategoryMap[date][categoryName] = minutes;
      }
    }

    const daily = dailyResult.length > 0
      ? dailyResult[0].values.map(row => ({
          date: row[0] as string,
          minutes: row[1] as number,
          byCategory: dailyByCategoryMap[row[0] as string] || {}
        }))
      : [];

    // Get top descriptions
    const descriptionsResult = db.exec(`
      SELECT description, COUNT(*) as count, COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ? AND description IS NOT NULL AND description != ''
      GROUP BY description
      ORDER BY count DESC
      LIMIT 10
    `, [userId, start, end]);

    const topNotes = descriptionsResult.length > 0
      ? descriptionsResult[0].values.map(row => ({
          description: row[0] as string,
          count: row[1] as number,
          total_minutes: row[2] as number
        }))
      : [];

    // Calculate summary
    const totalMinutes = byCategory.reduce((sum, cat) => sum + cat.minutes, 0);
    const totalEntries = byCategory.reduce((sum, cat) => sum + cat.count, 0);
    const daysInPeriod = Math.max(1, daily.length);
    const avgMinutesPerDay = Math.round(totalMinutes / daysInPeriod);

    // Get previous period for comparison
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength).toISOString();
    const prevEnd = start as string;

    const prevResult = db.exec(`
      SELECT COALESCE(SUM(duration_minutes), 0) as total
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ?
    `, [userId, prevStart, prevEnd]);

    const previousTotal = prevResult.length > 0 && prevResult[0].values.length > 0
      ? prevResult[0].values[0][0] as number
      : 0;

    const change = previousTotal > 0 
      ? Math.round(((totalMinutes - previousTotal) / previousTotal) * 100)
      : 0;

    res.json({
      period: { start, end },
      summary: {
        totalMinutes,
        totalEntries,
        avgMinutesPerDay,
        previousTotal,
        change
      },
      byCategory,
      daily,
      topNotes
    });
  } catch (error) {
    logger.error('Error fetching analytics', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
