import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Get all time entries for user
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.exec(`
      SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ?
      ORDER BY te.start_time DESC
      LIMIT 100
    `, [req.userId as number]);

    const entries = result.length > 0 
      ? result[0].values.map(row => ({
          id: row[0] as number,
          user_id: row[1] as number,
          category_id: row[2] as number,
          category_name: row[3] as string,
          category_color: row[4] as string | null,
          note: row[5] as string | null,
          start_time: row[6] as string,
          end_time: row[7] as string | null,
          duration_minutes: row[8] as number | null,
          created_at: row[9] as string
        }))
      : [];

    res.json(entries);
  } catch (error) {
    logger.error('Error fetching time entries', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Get active entry
router.get('/active', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const result = db.exec(`
      SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.end_time IS NULL
      LIMIT 1
    `, [req.userId as number]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.json(null);
    }

    const row = result[0].values[0];
    res.json({
      id: row[0] as number,
      user_id: row[1] as number,
      category_id: row[2] as number,
      category_name: row[3] as string,
      category_color: row[4] as string | null,
      note: row[5] as string | null,
      start_time: row[6] as string,
      end_time: row[7] as string | null,
      duration_minutes: row[8] as number | null,
      created_at: row[9] as string
    });
  } catch (error) {
    logger.error('Error fetching active entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to fetch active entry' });
  }
});

// Start new entry
router.post('/start', (req: AuthRequest, res: Response) => {
  try {
    const { category_id, note } = req.body;
    
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
      const duration = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
      
      db.run(
        `UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?`,
        [endTime, duration, activeId]
      );
    }

    const startTime = new Date().toISOString();
    db.run(
      `INSERT INTO time_entries (user_id, category_id, note, start_time) VALUES (?, ?, ?, ?)`,
      [req.userId as number, category_id, note || null, startTime]
    );
    saveDatabase();

    const result = db.exec(`
      SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ? AND te.end_time IS NULL
    `, [req.userId as number]);

    const row = result[0].values[0];
    logger.info('Time entry started', { entryId: row[0], userId: req.userId as number });

    res.status(201).json({
      id: row[0] as number,
      user_id: row[1] as number,
      category_id: row[2] as number,
      category_name: row[3] as string,
      category_color: row[4] as string | null,
      note: row[5] as string | null,
      start_time: row[6] as string,
      end_time: row[7] as string | null,
      duration_minutes: row[8] as number | null,
      created_at: row[9] as string
    });
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
    const duration = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);

    db.run(
      `UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?`,
      [endTime, duration, id]
    );
    saveDatabase();

    const result = db.exec(`
      SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `, [id]);

    const row = result[0].values[0];
    logger.info('Time entry stopped', { entryId: id, duration, userId: req.userId as number });

    res.json({
      id: row[0] as number,
      user_id: row[1] as number,
      category_id: row[2] as number,
      category_name: row[3] as string,
      category_color: row[4] as string | null,
      note: row[5] as string | null,
      start_time: row[6] as string,
      end_time: row[7] as string | null,
      duration_minutes: row[8] as number | null,
      created_at: row[9] as string
    });
  } catch (error) {
    logger.error('Error stopping time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to stop time entry' });
  }
});

// Update entry
router.put('/:id', (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, note } = req.body;
    const db = getDb();

    const existing = db.exec(
      `SELECT id FROM time_entries WHERE id = ? AND user_id = ?`,
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

    db.run(
      `UPDATE time_entries SET category_id = COALESCE(?, category_id), note = ? WHERE id = ?`,
      [category_id || null, note, id]
    );
    saveDatabase();

    const result = db.exec(`
      SELECT te.id, te.user_id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `, [id]);

    const row = result[0].values[0];
    logger.info('Time entry updated', { entryId: id, userId: req.userId as number });

    res.json({
      id: row[0] as number,
      user_id: row[1] as number,
      category_id: row[2] as number,
      category_name: row[3] as string,
      category_color: row[4] as string | null,
      note: row[5] as string | null,
      start_time: row[6] as string,
      end_time: row[7] as string | null,
      duration_minutes: row[8] as number | null,
      created_at: row[9] as string
    });
  } catch (error) {
    logger.error('Error updating time entry', { error, userId: req.userId as number });
    res.status(500).json({ error: 'Failed to update time entry' });
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

export default router;
