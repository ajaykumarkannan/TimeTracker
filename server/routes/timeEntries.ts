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

const router = Router();

router.use(flexAuthMiddleware);

// Get all time entries for user with pagination
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
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
    const { category_id, description } = req.body;
    
    if (!category_id) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const db = getDb();

    // Verify category belongs to user
    const catCheck = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [category_id, req.userId as number]
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
      `INSERT INTO time_entries (user_id, category_id, description, start_time) VALUES (?, ?, ?, ?)`,
      [req.userId as number, category_id, description || null, startTime]
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
    const { category_id, description, start_time, end_time } = req.body;
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
           description = ?, 
           start_time = COALESCE(?, start_time),
           end_time = ?,
           duration_minutes = ?
       WHERE id = ?`,
      [category_id || null, description, start_time || null, newEnd, duration, id]
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
    const { category_id, description, start_time, end_time } = req.body;
    
    if (!category_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Category, start time, and end time are required' });
    }

    const db = getDb();

    // Verify category belongs to user
    const catCheck = db.exec(
      `SELECT id FROM categories WHERE id = ? AND user_id = ?`,
      [category_id, req.userId as number]
    );
    if (catCheck.length === 0 || catCheck[0].values.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Calculate duration
    const duration = calculateDurationMinutes(start_time, end_time);
    
    if (duration < 0) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    db.run(
      `INSERT INTO time_entries (user_id, category_id, description, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId as number, category_id, description || null, start_time, end_time, duration]
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

// Get description suggestions based on history
router.get('/suggestions', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;
    const query = (req.query.q as string || '').toLowerCase().trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    let sql = `
      SELECT description, category_id, COUNT(*) as count, SUM(duration_minutes) as total_minutes, MAX(start_time) as last_used
      FROM time_entries
      WHERE user_id = ? AND description IS NOT NULL AND description != ''
    `;
    const params: (number | string)[] = [req.userId as number];

    if (categoryId) {
      sql += ` AND category_id = ?`;
      params.push(categoryId);
    }

    if (query) {
      sql += ` AND LOWER(description) LIKE ?`;
      params.push(`%${query}%`);
    }

    sql += ` GROUP BY description, category_id ORDER BY count DESC, total_minutes DESC LIMIT ?`;
    params.push(limit);

    const result = db.exec(sql, params);

    const suggestions = result.length > 0
      ? result[0].values.map(row => ({
          description: row[0] as string,
          categoryId: row[1] as number,
          count: row[2] as number,
          totalMinutes: row[3] as number,
          lastUsed: row[4] as string
        }))
      : [];

    res.json(suggestions);
  } catch (error) {
    logger.error('Error fetching description suggestions', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Merge descriptions - update all entries with source descriptions to use target description and optionally target category
router.post('/merge-descriptions', (req: AuthRequest, res: Response) => {
  try {
    const { sourceDescriptions, targetDescription, targetCategoryName } = req.body;
    
    if (!Array.isArray(sourceDescriptions) || sourceDescriptions.length === 0) {
      return res.status(400).json({ error: 'sourceDescriptions must be a non-empty array' });
    }
    
    if (typeof targetDescription !== 'string' || !targetDescription.trim()) {
      return res.status(400).json({ error: 'targetDescription must be a non-empty string' });
    }

    const db = getDb();
    const userId = req.userId as number;
    
    // Build placeholders for IN clause
    const placeholders = sourceDescriptions.map(() => '?').join(', ');
    
    // Count entries that will be updated
    const countResult = db.exec(
      `SELECT COUNT(*) as count FROM time_entries 
       WHERE user_id = ? AND description IN (${placeholders})`,
      [userId, ...sourceDescriptions]
    );
    const totalEntries = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;
    
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified descriptions' });
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
    
    // Update all entries with source descriptions to use target description (and optionally category)
    if (targetCategoryId !== null) {
      db.run(
        `UPDATE time_entries SET description = ?, category_id = ? 
         WHERE user_id = ? AND description IN (${placeholders})`,
        [targetDescription.trim(), targetCategoryId, userId, ...sourceDescriptions]
      );
    } else {
      db.run(
        `UPDATE time_entries SET description = ? 
         WHERE user_id = ? AND description IN (${placeholders})`,
        [targetDescription.trim(), userId, ...sourceDescriptions]
      );
    }
    saveDatabase();

    logger.info('Descriptions merged', { 
      sourceDescriptions, 
      targetDescription,
      targetCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ 
      merged: sourceDescriptions.length, 
      entriesUpdated: totalEntries,
      targetDescription: targetDescription.trim()
    });
  } catch (error) {
    logger.error('Error merging descriptions', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to merge descriptions' });
  }
});

// Update all entries with a specific description+category to new description and/or category
router.post('/update-description-bulk', (req: AuthRequest, res: Response) => {
  try {
    const { oldDescription, oldCategoryName, newDescription, newCategoryName } = req.body;
    
    if (typeof oldDescription !== 'string' || !oldDescription.trim()) {
      return res.status(400).json({ error: 'oldDescription must be a non-empty string' });
    }
    
    if (typeof oldCategoryName !== 'string' || !oldCategoryName.trim()) {
      return res.status(400).json({ error: 'oldCategoryName must be a non-empty string' });
    }
    
    // At least one of newDescription or newCategoryName must be provided
    if (!newDescription && !newCategoryName) {
      return res.status(400).json({ error: 'At least one of newDescription or newCategoryName must be provided' });
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
       WHERE user_id = ? AND description = ? AND category_id = ?`,
      [userId, oldDescription.trim(), oldCategoryId]
    );
    const totalEntries = countResult.length > 0 ? countResult[0].values[0][0] as number : 0;
    
    if (totalEntries === 0) {
      return res.status(404).json({ error: 'No entries found with the specified description and category' });
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
    const finalDescription = newDescription ? newDescription.trim() : oldDescription.trim();
    const finalCategoryId = newCategoryId !== null ? newCategoryId : oldCategoryId;
    
    db.run(
      `UPDATE time_entries SET description = ?, category_id = ? 
       WHERE user_id = ? AND description = ? AND category_id = ?`,
      [finalDescription, finalCategoryId, userId, oldDescription.trim(), oldCategoryId]
    );
    saveDatabase();

    logger.info('Descriptions updated in bulk', { 
      oldDescription, 
      oldCategoryName,
      newDescription: finalDescription,
      newCategoryName: newCategoryName || oldCategoryName,
      entriesUpdated: totalEntries, 
      userId
    });

    res.json({ entriesUpdated: totalEntries });
  } catch (error) {
    logger.error('Error updating descriptions in bulk', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update descriptions' });
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
