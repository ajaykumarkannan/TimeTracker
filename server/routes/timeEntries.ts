import express from 'express';
import { db } from '../database';
import { logger } from '../logger';

const router = express.Router();

// Get all time entries with category info
router.get('/', (req, res) => {
  try {
    const entries = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      ORDER BY te.start_time DESC
    `).all();
    res.json(entries);
  } catch (error) {
    logger.error('Error fetching time entries', { error });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Get active time entry
router.get('/active', (req, res) => {
  try {
    const entry = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.end_time IS NULL
      ORDER BY te.start_time DESC
      LIMIT 1
    `).get();
    res.json(entry || null);
  } catch (error) {
    logger.error('Error fetching active entry', { error });
    res.status(500).json({ error: 'Failed to fetch active entry' });
  }
});

// Start time entry
router.post('/start', (req, res) => {
  const { category_id, note } = req.body;

  if (!category_id) {
    return res.status(400).json({ error: 'Category ID is required' });
  }

  try {
    // Stop any active entries
    db.prepare(`
      UPDATE time_entries 
      SET end_time = CURRENT_TIMESTAMP,
          duration_minutes = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 24 * 60 AS INTEGER)
      WHERE end_time IS NULL
    `).run();

    const result = db.prepare(`
      INSERT INTO time_entries (category_id, note, start_time)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(category_id, note || null);

    const entry = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `).get(result.lastInsertRowid);

    logger.info('Time entry started', { id: result.lastInsertRowid, category_id });
    res.status(201).json(entry);
  } catch (error) {
    logger.error('Error starting time entry', { error });
    res.status(500).json({ error: 'Failed to start time entry' });
  }
});

// Stop time entry
router.post('/:id/stop', (req, res) => {
  const { id } = req.params;

  try {
    db.prepare(`
      UPDATE time_entries 
      SET end_time = CURRENT_TIMESTAMP,
          duration_minutes = CAST((julianday(CURRENT_TIMESTAMP) - julianday(start_time)) * 24 * 60 AS INTEGER)
      WHERE id = ?
    `).run(id);

    const entry = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `).get(id);

    logger.info('Time entry stopped', { id });
    res.json(entry);
  } catch (error) {
    logger.error('Error stopping time entry', { error });
    res.status(500).json({ error: 'Failed to stop time entry' });
  }
});

// Update time entry
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { category_id, note, start_time, end_time } = req.body;

  try {
    db.prepare(`
      UPDATE time_entries 
      SET category_id = ?, note = ?, start_time = ?, end_time = ?,
          duration_minutes = CASE 
            WHEN ? IS NOT NULL THEN CAST((julianday(?) - julianday(?)) * 24 * 60 AS INTEGER)
            ELSE NULL
          END
      WHERE id = ?
    `).run(category_id, note, start_time, end_time, end_time, end_time, start_time, id);

    const entry = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `).get(id);

    logger.info('Time entry updated', { id });
    res.json(entry);
  } catch (error) {
    logger.error('Error updating time entry', { error });
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  try {
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
    logger.info('Time entry deleted', { id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting time entry', { error });
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
