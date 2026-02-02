import { Router, Response } from 'express';
import { getDb } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Get all descriptions (paginated) for a date range
router.get('/descriptions', (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const db = getDb();
    const userId = req.userId as number;

    // Get total count of unique descriptions
    const countResult = db.exec(`
      SELECT COUNT(DISTINCT description) as total
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ? 
        AND description IS NOT NULL AND description != ''
    `, [userId, start, end]);

    const totalCount = countResult.length > 0 && countResult[0].values.length > 0
      ? countResult[0].values[0][0] as number
      : 0;

    // Get paginated descriptions
    const descriptionsResult = db.exec(`
      SELECT description, COUNT(*) as count, COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ? 
        AND description IS NOT NULL AND description != ''
      GROUP BY description
      ORDER BY total_minutes DESC, count DESC
      LIMIT ? OFFSET ?
    `, [userId, start, end, pageSize, offset]);

    const descriptions = descriptionsResult.length > 0
      ? descriptionsResult[0].values.map(row => ({
          description: row[0] as string,
          count: row[1] as number,
          total_minutes: row[2] as number
        }))
      : [];

    res.json({
      descriptions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.error('Error fetching descriptions', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch descriptions' });
  }
});

// Get category drilldown with paginated descriptions
router.get('/category/:categoryName', (req: AuthRequest, res: Response) => {
  try {
    const { categoryName } = req.params;
    const start = req.query.start as string;
    const end = req.query.end as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const db = getDb();
    const userId = req.userId as number;

    // Get category info
    const categoryResult = db.exec(`
      SELECT c.name, c.color, 
             COALESCE(SUM(te.duration_minutes), 0) as minutes,
             COUNT(te.id) as count
      FROM categories c
      LEFT JOIN time_entries te ON c.id = te.category_id 
        AND te.start_time >= ? AND te.start_time < ?
        AND te.user_id = ?
      WHERE c.user_id = ? AND c.name = ?
      GROUP BY c.id, c.name, c.color
    `, [start, end, userId, userId, categoryName]);

    if (categoryResult.length === 0 || categoryResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const categoryRow = categoryResult[0].values[0];
    const category = {
      name: categoryRow[0] as string,
      color: categoryRow[1] as string || '#6b7280',
      minutes: categoryRow[2] as number,
      count: categoryRow[3] as number
    };

    // Get total count of unique descriptions for this category
    const countResult = db.exec(`
      SELECT COUNT(DISTINCT te.description) as total
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ? 
        AND c.name = ?
        AND te.description IS NOT NULL AND te.description != ''
    `, [userId, start, end, categoryName]);

    const totalCount = countResult.length > 0 && countResult[0].values.length > 0
      ? countResult[0].values[0][0] as number
      : 0;

    // Get paginated descriptions for this category
    const descriptionsResult = db.exec(`
      SELECT te.description, COUNT(*) as count, COALESCE(SUM(te.duration_minutes), 0) as total_minutes
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ? 
        AND c.name = ?
        AND te.description IS NOT NULL AND te.description != ''
      GROUP BY te.description
      ORDER BY total_minutes DESC, count DESC
      LIMIT ? OFFSET ?
    `, [userId, start, end, categoryName, pageSize, offset]);

    const descriptions = descriptionsResult.length > 0
      ? descriptionsResult[0].values.map(row => ({
          description: row[0] as string,
          count: row[1] as number,
          total_minutes: row[2] as number
        }))
      : [];

    res.json({
      category,
      descriptions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.error('Error fetching category drilldown', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch category drilldown' });
  }
});

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
