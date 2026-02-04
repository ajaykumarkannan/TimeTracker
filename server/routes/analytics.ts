import { Router, Response } from 'express';
import { getDb } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Update a task name (rename and/or change category for all entries with that task name)
router.put('/task-names', (req: AuthRequest, res: Response) => {
  try {
    const { oldTaskName, newTaskName, newCategoryId } = req.body;
    
    if (!oldTaskName) {
      return res.status(400).json({ error: 'oldTaskName is required' });
    }
    
    if (!newTaskName && newCategoryId === undefined) {
      return res.status(400).json({ error: 'Either newTaskName or newCategoryId is required' });
    }

    const db = getDb();
    const userId = req.userId as number;

    // Verify category exists if changing category
    if (newCategoryId !== undefined) {
      const categoryCheck = db.exec(
        'SELECT id FROM categories WHERE id = ? AND user_id = ?',
        [newCategoryId, userId]
      );
      if (categoryCheck.length === 0 || categoryCheck[0].values.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }

    // Build the update query dynamically
    const updates: string[] = [];
    const params: (string | number)[] = [];
    
    if (newTaskName) {
      updates.push('task_name = ?');
      params.push(newTaskName);
    }
    
    if (newCategoryId !== undefined) {
      updates.push('category_id = ?');
      params.push(newCategoryId);
    }
    
    params.push(oldTaskName, userId);

    const updateQuery = `
      UPDATE time_entries 
      SET ${updates.join(', ')}
      WHERE task_name = ? AND user_id = ?
    `;
    
    db.run(updateQuery, params);
    
    // Get count of updated entries
    const countResult = db.exec(
      'SELECT changes() as count'
    );
    const updatedCount = countResult.length > 0 && countResult[0].values.length > 0
      ? countResult[0].values[0][0] as number
      : 0;

    logger.info('Task name updated', { 
      userId, 
      oldTaskName, 
      newTaskName, 
      newCategoryId,
      updatedCount 
    });

    res.json({ 
      success: true, 
      updatedCount,
      oldTaskName,
      newTaskName: newTaskName || oldTaskName,
      newCategoryId
    });
  } catch (error) {
    logger.error('Error updating task name', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to update task name' });
  }
});

// Get all task names (paginated) for a date range
router.get('/task-names', (req: AuthRequest, res: Response) => {
  try {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const offset = (page - 1) * pageSize;
    const sortBy = (req.query.sortBy as string) || 'time'; // time, alpha, count, recent
    
    // Optional filters
    const searchQuery = (req.query.search as string || '').trim().toLowerCase();
    const categoryFilter = (req.query.category as string || '').trim();

    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const db = getDb();
    const userId = req.userId as number;

    // Build WHERE clause with optional filters
    let whereClause = `te.user_id = ? AND te.start_time >= ? AND te.start_time < ? 
        AND te.task_name IS NOT NULL AND te.task_name != ''`;
    const countParams: (number | string)[] = [userId, start, end];
    const queryParams: (number | string)[] = [userId, start, end];
    
    if (searchQuery) {
      whereClause += ` AND (LOWER(te.task_name) LIKE ? OR LOWER(c.name) LIKE ?)`;
      countParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }
    
    if (categoryFilter) {
      whereClause += ` AND c.name = ?`;
      countParams.push(categoryFilter);
      queryParams.push(categoryFilter);
    }

    // Get total count of unique task names (with filters applied)
    const countResult = db.exec(`
      SELECT COUNT(DISTINCT te.task_name || '|' || c.name) as total
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE ${whereClause}
    `, countParams);

    const totalCount = countResult.length > 0 && countResult[0].values.length > 0
      ? countResult[0].values[0][0] as number
      : 0;

    // Determine ORDER BY clause based on sortBy
    let orderBy: string;
    switch (sortBy) {
      case 'alpha':
        orderBy = 'task_name ASC';
        break;
      case 'count':
        orderBy = 'count DESC, total_minutes DESC';
        break;
      case 'recent':
        orderBy = 'last_used DESC, total_minutes DESC';
        break;
      case 'time':
      default:
        orderBy = 'total_minutes DESC, count DESC';
        break;
    }

    // Add pagination params
    queryParams.push(pageSize, offset);

    // Get paginated task names with category info
    const taskNamesResult = db.exec(`
      SELECT te.task_name, COUNT(*) as count, COALESCE(SUM(te.duration_minutes), 0) as total_minutes, MAX(te.start_time) as last_used,
             c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE ${whereClause}
      GROUP BY te.task_name, c.name, c.color
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, queryParams);

    const taskNames = taskNamesResult.length > 0
      ? taskNamesResult[0].values.map(row => ({
          task_name: row[0] as string,
          count: row[1] as number,
          total_minutes: row[2] as number,
          last_used: row[3] as string,
          category_name: row[4] as string,
          category_color: row[5] as string | null
        }))
      : [];

    res.json({
      taskNames,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.error('Error fetching task names', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch task names' });
  }
});

// Get category drilldown with paginated task names
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

    // Get total count of unique task names for this category
    const countResult = db.exec(`
      SELECT COUNT(DISTINCT te.task_name) as total
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ? 
        AND c.name = ?
        AND te.task_name IS NOT NULL AND te.task_name != ''
    `, [userId, start, end, categoryName]);

    const totalCount = countResult.length > 0 && countResult[0].values.length > 0
      ? countResult[0].values[0][0] as number
      : 0;

    // Get paginated task names for this category
    const taskNamesResult = db.exec(`
      SELECT te.task_name, COUNT(*) as count, COALESCE(SUM(te.duration_minutes), 0) as total_minutes
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ? 
        AND c.name = ?
        AND te.task_name IS NOT NULL AND te.task_name != ''
      GROUP BY te.task_name
      ORDER BY total_minutes DESC, count DESC
      LIMIT ? OFFSET ?
    `, [userId, start, end, categoryName, pageSize, offset]);

    const taskNames = taskNamesResult.length > 0
      ? taskNamesResult[0].values.map(row => ({
          task_name: row[0] as string,
          count: row[1] as number,
          total_minutes: row[2] as number
        }))
      : [];

    res.json({
      category,
      taskNames,
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
    const timezoneOffset = parseInt(req.query.timezoneOffset as string) || 0; // Minutes offset from UTC
    
    if (!start || !end) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const db = getDb();
    const userId = req.userId as number;
    
    // Convert offset to hours for SQLite datetime adjustment
    // timezoneOffset is in minutes (e.g., -480 for PST which is UTC-8)
    // We need to ADD this offset to convert UTC to local time
    const offsetHours = -timezoneOffset / 60; // Negate because JS offset is inverted
    const offsetSign = offsetHours >= 0 ? '+' : '';
    const dateAdjustment = `datetime(start_time, '${offsetSign}${offsetHours} hours')`;

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

    // Get daily totals - adjust for timezone when grouping by date
    const dailyResult = db.exec(`
      SELECT DATE(${dateAdjustment}) as date, 
             COALESCE(SUM(duration_minutes), 0) as minutes
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ?
      GROUP BY DATE(${dateAdjustment})
      ORDER BY date
    `, [userId, start, end]);

    // Get daily breakdown by category - adjust for timezone when grouping by date
    const dailyByCategoryResult = db.exec(`
      SELECT DATE(${dateAdjustment}) as date, c.name, COALESCE(SUM(te.duration_minutes), 0) as minutes
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ?
      GROUP BY DATE(${dateAdjustment}), c.name
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

    // Get top task names
    const taskNamesResult = db.exec(`
      SELECT task_name, COUNT(*) as count, COALESCE(SUM(duration_minutes), 0) as total_minutes
      FROM time_entries
      WHERE user_id = ? AND start_time >= ? AND start_time < ? AND task_name IS NOT NULL AND task_name != ''
      GROUP BY task_name
      ORDER BY count DESC
      LIMIT 10
    `, [userId, start, end]);

    const topTasks = taskNamesResult.length > 0
      ? taskNamesResult[0].values.map(row => ({
          task_name: row[0] as string,
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
      topTasks
    });
  } catch (error) {
    logger.error('Error fetching analytics', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
