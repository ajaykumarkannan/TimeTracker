import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';
import { 
  TIME_ENTRIES_WITH_CATEGORIES_QUERY, 
  rowToTimeEntry, 
  rowsToTimeEntries,
  calculateDurationMinutes 
} from '../utils/queryHelpers';
import {
  validateDateParam,
  validatePositiveInt,
  validateCategoryId,
  validateTaskName,
  isValidISODate
} from '../utils/validation';

const router = Router();

router.use(flexAuthMiddleware);

// Get all time entries for user with pagination
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    
    // Optional category filter
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;
    
    // Optional search query (searches task_name and category_name)
    const searchQuery = (req.query.search as string || '').trim().toLowerCase();
    
    // When filtering by category or search, use a higher default limit to return all matching entries
    const hasFilters = categoryId || searchQuery;
    const defaultLimit = hasFilters ? 1000 : 100;
    
    // Validate query parameters
    const limit = Math.min(validatePositiveInt(req.query.limit, 'limit', defaultLimit), 5000);
    const offset = validatePositiveInt(req.query.offset, 'offset', 0);
    
    let startDate: string | null;
    let endDate: string | null;
    try {
      startDate = validateDateParam(req.query.startDate, 'startDate');
      endDate = validateDateParam(req.query.endDate, 'endDate');
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    
    let query = TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.user_id = ?`;
    const params: (number | string)[] = [req.userId as number];
    
    // Optional date filtering
    if (startDate) {
      query += ` AND te.start_time >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND te.start_time <= ?`;
      params.push(endDate);
    }
    
    // Optional category filtering
    if (categoryId) {
      query += ` AND te.category_id = ?`;
      params.push(categoryId);
    }
    
    // Optional search filtering (task_name or category_name)
    if (searchQuery) {
      query += ` AND (LOWER(te.task_name) LIKE ? OR LOWER(c.name) LIKE ?)`;
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }
    
    query += ` ORDER BY te.start_time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const result = db.exec(query, params);
    res.json(rowsToTimeEntries(result));
  } catch (error) {
    logger.error('Error fetching time entries', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Get active entry
router.get('/active', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.exec(
      TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.user_id = ? AND te.end_time IS NULL LIMIT 1`,
      [req.userId as number]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json(null);
    }

    res.json(rowToTimeEntry(result[0].values[0]));
  } catch (error) {
    logger.error('Error fetching active entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch active entry' });
  }
});

// Start new entry
router.post('/start', (req: AuthRequest, res: Response) => {
  try {
    let categoryId: number;
    let taskName: string | null;
    
    try {
      categoryId = validateCategoryId(req.body.category_id);
      taskName = validateTaskName(req.body.task_name);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const db = getDb();

    // Verify category belongs to user
    const catCheck = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [categoryId, req.userId as number]
    );
    if (catCheck.length === 0 || catCheck[0].values.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Stop any active entry first
    const activeResult = db.exec(
      `SELECT id, start_time FROM time_entries WHERE user_id = ? AND end_time IS NULL`,
      [req.userId as number]
    );
    
    if (activeResult.length > 0 && activeResult[0].values.length > 0) {
      const activeId = activeResult[0].values[0][0] as number;
      const startTime = activeResult[0].values[0][1] as string;
      const endTime = new Date().toISOString();
      const duration = calculateDurationMinutes(startTime, endTime);
      
      db.run(
        `UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?`,
        [endTime, duration, activeId]
      );
    }

    const startTime = new Date().toISOString();
    db.run(
      `INSERT INTO time_entries (user_id, category_id, task_name, start_time) VALUES (?, ?, ?, ?)`,
      [req.userId as number, categoryId, taskName, startTime]
    );
    saveDatabase();

    const result = db.exec(
      TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.user_id = ? AND te.end_time IS NULL`,
      [req.userId as number]
    );

    const entry = rowToTimeEntry(result[0].values[0]);
    logger.info('Time entry started', { entryId: entry.id, userId: req.userId as number });

    res.status(201).json(entry);
  } catch (error) {
    logger.error('Error starting time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to start time entry' });
  }
});

// Stop entry
router.post('/:id/stop', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = db.exec(
      `SELECT start_time FROM time_entries WHERE id = ? AND user_id = ? AND end_time IS NULL`,
      [id, req.userId as number]
    );

    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: 'Active entry not found' });
    }

    const startTime = existing[0].values[0][0] as string;
    const endTime = new Date().toISOString();
    const duration = calculateDurationMinutes(startTime, endTime);

    db.run(
      `UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?`,
      [endTime, duration, id]
    );
    saveDatabase();

    const result = db.exec(
      TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.id = ?`,
      [id]
    );

    const entry = rowToTimeEntry(result[0].values[0]);
    logger.info('Time entry stopped', { entryId: id, duration, userId: req.userId as number });

    res.json(entry);
  } catch (error) {
    logger.error('Error stopping time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to stop time entry' });
  }
});

// Update entry
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, task_name, start_time, end_time } = req.body;
    const db = getDb();

    const existing = db.exec(
      `SELECT id, start_time, end_time FROM time_entries WHERE id = ? AND user_id = ?`,
      [id, req.userId as number]
    );

    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (category_id) {
      const catCheck = db.exec(
        `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
        [category_id, req.userId as number]
      );
      if (catCheck.length === 0 || catCheck[0].values.length === 0) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

    // Calculate new duration if times are being updated
    const currentStart = existing[0].values[0][1] as string;
    const currentEnd = existing[0].values[0][2] as string | null;
    const newStart = start_time || currentStart;
    const newEnd = end_time !== undefined ? end_time : currentEnd;
    
    const duration = newEnd ? calculateDurationMinutes(newStart, newEnd) : null;

    db.run(
      `UPDATE time_entries 
       SET category_id = COALESCE(?, category_id), 
           task_name = ?, 
           start_time = COALESCE(?, start_time),
           end_time = ?,
           duration_minutes = ?
       WHERE id = ?`,
      [category_id || null, task_name, start_time || null, newEnd, duration, id]
    );
    saveDatabase();

    const result = db.exec(
      TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.id = ?`,
      [id]
    );

    logger.info('Time entry updated', { entryId: id, userId: req.userId as number });
    res.json(rowToTimeEntry(result[0].values[0]));
  } catch (error) {
    logger.error('Error updating time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Create manual entry (for past tasks)
router.post('/', (req: AuthRequest, res: Response) => {
  try {
    let categoryId: number;
    let taskName: string | null;
    let startTime: string;
    let endTime: string;
    
    try {
      categoryId = validateCategoryId(req.body.category_id);
      taskName = validateTaskName(req.body.task_name);
      
      if (!req.body.start_time || !isValidISODate(req.body.start_time)) {
        throw new Error('start_time must be a valid ISO 8601 date');
      }
      startTime = req.body.start_time;
      
      if (!req.body.end_time || !isValidISODate(req.body.end_time)) {
        throw new Error('end_time must be a valid ISO 8601 date');
      }
      endTime = req.body.end_time;
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const db = getDb();

    // Verify category belongs to user
    const catCheck = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [categoryId, req.userId as number]
    );
    if (catCheck.length === 0 || catCheck[0].values.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Calculate duration
    const duration = calculateDurationMinutes(startTime, endTime);
    
    if (duration < 0) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    db.run(
      `INSERT INTO time_entries (user_id, category_id, task_name, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId as number, categoryId, taskName, startTime, endTime, duration]
    );
    saveDatabase();

    const result = db.exec(`SELECT last_insert_rowid() as id`);
    const newId = result[0].values[0][0] as number;

    const entryResult = db.exec(
      TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.id = ?`,
      [newId]
    );

    const entry = rowToTimeEntry(entryResult[0].values[0]);
    logger.info('Manual time entry created', { entryId: newId, userId: req.userId as number });

    res.status(201).json(entry);
  } catch (error) {
    logger.error('Error creating manual time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Delete entry
router.delete('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = db.exec(
      `SELECT id FROM time_entries WHERE id = ? AND user_id = ?`,
      [id, req.userId as number]
    );

    if (existing.length === 0 || existing[0].values.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    db.run(`DELETE FROM time_entries WHERE id = ?`, [id]);
    saveDatabase();

    logger.info('Time entry deleted', { entryId: id, userId: req.userId as number });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// Get task name suggestions based on history
router.get('/suggestions', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;
    const query = (req.query.q as string || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    let sql = `
      SELECT task_name, category_id, COUNT(*) as count, SUM(duration_minutes) as total_minutes, MAX(start_time) as last_used
      FROM time_entries
      WHERE user_id = ? AND task_name IS NOT NULL AND task_name != ''
    `;
    const params: (number | string)[] = [req.userId as number];

    if (categoryId) {
      sql += ` AND category_id = ?`;
      params.push(categoryId);
    }

    if (query) {
      sql += ` AND LOWER(task_name) LIKE ?`;
      params.push(`%${query}%`);
    }

    sql += ` GROUP BY task_name, category_id ORDER BY count DESC, total_minutes DESC LIMIT ?`;
    params.push(limit);

    const result = db.exec(sql, params);

    const suggestions = result.length > 0
      ? result[0].values.map(row => ({
          task_name: row[0] as string,
          categoryId: row[1] as number,
          count: row[2] as number,
          totalMinutes: row[3] as number,
          lastUsed: row[4] as string
        }))
      : [];

    res.json(suggestions);
  } catch (error) {
    logger.error('Error fetching task name suggestions', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Merge task names - update all entries with source task names to use target task name and optionally target category
router.post('/merge-task-names', (req: AuthRequest, res: Response) => {
  try {
    const { sourceTaskNames, targetTaskName, targetCategoryName } = req.body;
    
    if (!Array.isArray(sourceTaskNames) || sourceTaskNames.length === 0) {
      return res.status(400).json({ error: 'sourceTaskNames must be a non-empty array' });
    }
    
    if (typeof targetTaskName !== 'string' || !targetTaskName.trim()) {
      return res.status(400).json({ error: 'targetTaskName must be a non-empty string' });
    }

    const db = getDb();
    const userId = req.userId as number;
    
    // Build placeholders for IN clause
    const placeholders = sourceTaskNames.map(() => '?').join(', ');
    
    // Count entries that will be updated
    const countResult = db.exec(
      `SELECT COUNT(*) as count FROM time_entries 
       WHERE user_id = ? AND task_name IN (${placeholders})`,
      [userId, ...sourceTaskNames]
    );
    const totalEntries = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;
    
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified task names' });
    }
    
    // If target category is specified, look up its ID
    let targetCategoryId: number | null = null;
    if (targetCategoryName) {
      const categoryResult = db.exec(
        `SELECT id FROM categories WHERE user_id = ? AND name = ?`,
        [userId, targetCategoryName]
      );
      if (categoryResult.length > 0 && categoryResult[0].values.length > 0) {
        targetCategoryId = categoryResult[0].values[0][0] as number;
      }
    }
    
    // Update all entries with source task names to use target task name (and optionally category)
    if (targetCategoryId !== null) {
      db.run(
        `UPDATE time_entries SET task_name = ?, category_id = ? 
         WHERE user_id = ? AND task_name IN (${placeholders})`,
        [targetTaskName.trim(), targetCategoryId, userId, ...sourceTaskNames]
      );
    } else {
      db.run(
        `UPDATE time_entries SET task_name = ? 
         WHERE user_id = ? AND task_name IN (${placeholders})`,
        [targetTaskName.trim(), userId, ...sourceTaskNames]
      );
    }
    saveDatabase();

    logger.info('Task names merged', { 
      sourceTaskNames, 
      targetTaskName,
      targetCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ 
      merged: sourceTaskNames.length, 
      entriesUpdated: totalEntries,
      targetTaskName: targetTaskName.trim()
    });
  } catch (error) {
    logger.error('Error merging task names', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to merge task names' });
  }
});

// Update all entries with a specific task_name+category to new task_name and/or category
router.post('/update-task-name-bulk', (req: AuthRequest, res: Response) => {
  try {
    const { oldTaskName, oldCategoryName, newTaskName, newCategoryName } = req.body;
    
    if (typeof oldTaskName !== 'string' || !oldTaskName.trim()) {
      return res.status(400).json({ error: 'oldTaskName must be a non-empty string' });
    }
    
    if (typeof oldCategoryName !== 'string' || !oldCategoryName.trim()) {
      return res.status(400).json({ error: 'oldCategoryName must be a non-empty string' });
    }
    
    // At least one of newTaskName or newCategoryName must be provided
    if (!newTaskName && !newCategoryName) {
      return res.status(400).json({ error: 'At least one of newTaskName or newCategoryName must be provided' });
    }

    const db = getDb();
    const userId = req.userId as number;
    
    // Get the old category ID
    const oldCategoryResult = db.exec(
      `SELECT id FROM categories WHERE user_id = ? AND name = ?`,
      [userId, oldCategoryName.trim()]
    );
    
    if (oldCategoryResult.length === 0 || oldCategoryResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Old category not found' });
    }
    const oldCategoryId = oldCategoryResult[0].values[0][0] as number;
    
    // Count entries that will be updated
    const countResult = db.exec(
      `SELECT COUNT(*) as count FROM time_entries 
       WHERE user_id = ? AND task_name = ? AND category_id = ?`,
      [userId, oldTaskName.trim(), oldCategoryId]
    );
    const totalEntries = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;
    
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified task name and category' });
    }
    
    // Get new category ID if changing category
    let newCategoryId: number | null = null;
    if (newCategoryName) {
      const newCategoryResult = db.exec(
        `SELECT id FROM categories WHERE user_id = ? AND name = ?`,
        [userId, newCategoryName.trim()]
      );
      if (newCategoryResult.length === 0 || newCategoryResult[0].values.length === 0) {
        return res.status(404).json({ error: 'New category not found' });
      }
      newCategoryId = newCategoryResult[0].values[0][0] as number;
    }
    
    // Build the update query based on what's being changed
    const finalTaskName = newTaskName ? newTaskName.trim() : oldTaskName.trim();
    const finalCategoryId = newCategoryId !== null ? newCategoryId : oldCategoryId;
    
    db.run(
      `UPDATE time_entries SET task_name = ?, category_id = ? 
       WHERE user_id = ? AND task_name = ? AND category_id = ?`,
      [finalTaskName, finalCategoryId, userId, oldTaskName.trim(), oldCategoryId]
    );
    saveDatabase();

    logger.info('Task names updated in bulk', { 
      oldTaskName, 
      oldCategoryName,
      newTaskName: finalTaskName,
      newCategoryName: newCategoryName || oldCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ entriesUpdated: totalEntries });
  } catch (error) {
    logger.error('Error updating task names in bulk', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update task names' });
  }
});

// Delete all entries for a specific date
router.delete('/by-date/:date', (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params;
    const db = getDb();

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // Count entries to be deleted (excluding active entries)
    const countResult = db.exec(
      `SELECT COUNT(*) as count FROM time_entries 
       WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND end_time IS NOT NULL`,
      [req.userId as number, startOfDay, endOfDay]
    );
    const count = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;

    if (count === 0) {
      return res.status(404).json({ error: 'No completed entries found for this date' });
    }

    // Delete entries (only completed ones, not active)
    db.run(
      `DELETE FROM time_entries 
       WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND end_time IS NOT NULL`,
      [req.userId as number, startOfDay, endOfDay]
    );
    saveDatabase();

    logger.info('Time entries deleted for date', { date, count, userId: req.userId as number });
    res.json({ deleted: count });
  } catch (error) {
    logger.error('Error deleting time entries by date', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to delete time entries' });
  }
});

export default router;
