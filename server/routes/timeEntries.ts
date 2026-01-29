import express from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';

const router = express.Router();

// Get all time entries with category info
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      ORDER BY te.start_time DESC
    `);
    const entries = [];
    while (stmt.step()) {
      entries.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(entries);
  } catch (error) {
    logger.error('Error fetching time entries', { error });
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Get active time entry
router.get('/active', (req, res) => {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.end_time IS NULL
      ORDER BY te.start_time DESC
      LIMIT 1
    `);
    let entry = null;
    if (stmt.step()) {
      entry = stmt.getAsObject();
    }
    stmt.free();
    res.json(entry);
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
    const db = getDb();
    const now = new Date().toISOString();
    
    // Stop any active entries
    const activeStmt = db.prepare('SELECT id, start_time FROM time_entries WHERE end_time IS NULL');
    while (activeStmt.step()) {
      const active = activeStmt.getAsObject() as any;
      const startTime = new Date(active.start_time).getTime();
      const duration = Math.floor((Date.now() - startTime) / 60000);
      db.run('UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?', 
        [now, duration, active.id]);
    }
    activeStmt.free();

    // Start new entry
    db.run('INSERT INTO time_entries (category_id, note, start_time) VALUES (?, ?, ?)',
      [category_id, note || null, now]);
    
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    saveDatabase();

    const stmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `);
    stmt.bind([lastId]);
    stmt.step();
    const entry = stmt.getAsObject();
    stmt.free();

    logger.info('Time entry started', { id: lastId, category_id });
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
    const db = getDb();
    const now = new Date().toISOString();
    
    // Get start time to calculate duration
    const getStmt = db.prepare('SELECT start_time FROM time_entries WHERE id = ?');
    getStmt.bind([id]);
    getStmt.step();
    const entry = getStmt.getAsObject() as any;
    getStmt.free();
    
    const startTime = new Date(entry.start_time).getTime();
    const duration = Math.floor((Date.now() - startTime) / 60000);
    
    db.run('UPDATE time_entries SET end_time = ?, duration_minutes = ? WHERE id = ?',
      [now, duration, id]);
    saveDatabase();

    const stmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `);
    stmt.bind([id]);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();

    logger.info('Time entry stopped', { id });
    res.json(result);
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
    const db = getDb();
    let duration = null;
    if (end_time && start_time) {
      const start = new Date(start_time).getTime();
      const end = new Date(end_time).getTime();
      duration = Math.floor((end - start) / 60000);
    }
    
    db.run('UPDATE time_entries SET category_id = ?, note = ?, start_time = ?, end_time = ?, duration_minutes = ? WHERE id = ?',
      [category_id, note, start_time, end_time, duration, id]);
    saveDatabase();

    const stmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.id = ?
    `);
    stmt.bind([id]);
    stmt.step();
    const entry = stmt.getAsObject();
    stmt.free();

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
    const db = getDb();
    db.run('DELETE FROM time_entries WHERE id = ?', [id]);
    saveDatabase();
    
    logger.info('Time entry deleted', { id });
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting time entry', { error });
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

export default router;
