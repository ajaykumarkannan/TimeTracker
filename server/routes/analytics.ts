import express from 'express';
import { getDb } from '../database';
import { logger } from '../logger';

const router = express.Router();

// Get analytics data for a date range
router.get('/', (req, res) => {
  const { start, end, period } = req.query;
  
  try {
    const db = getDb();
    
    // Get all entries in range
    const entriesStmt = db.prepare(`
      SELECT te.*, c.name as category_name, c.color as category_color
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.start_time >= ? AND te.start_time <= ?
      ORDER BY te.start_time DESC
    `);
    entriesStmt.bind([start, end]);
    
    const entries: any[] = [];
    while (entriesStmt.step()) {
      entries.push(entriesStmt.getAsObject());
    }
    entriesStmt.free();

    // Calculate totals by category
    const categoryTotals: { [key: string]: { name: string; color: string; minutes: number; count: number } } = {};
    let totalMinutes = 0;
    
    entries.forEach(entry => {
      const mins = entry.duration_minutes || 0;
      totalMinutes += mins;
      
      if (!categoryTotals[entry.category_id]) {
        categoryTotals[entry.category_id] = {
          name: entry.category_name,
          color: entry.category_color || '#6366f1',
          minutes: 0,
          count: 0
        };
      }
      categoryTotals[entry.category_id].minutes += mins;
      categoryTotals[entry.category_id].count += 1;
    });

    // Calculate daily breakdown
    const dailyTotals: { [key: string]: { date: string; minutes: number; byCategory: { [key: string]: number } } } = {};
    
    entries.forEach(entry => {
      const date = entry.start_time.split('T')[0];
      if (!dailyTotals[date]) {
        dailyTotals[date] = { date, minutes: 0, byCategory: {} };
      }
      const mins = entry.duration_minutes || 0;
      dailyTotals[date].minutes += mins;
      dailyTotals[date].byCategory[entry.category_name] = 
        (dailyTotals[date].byCategory[entry.category_name] || 0) + mins;
    });

    // Get comparison with previous period
    const startDate = new Date(start as string);
    const endDate = new Date(end as string);
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodLength).toISOString();
    const prevEnd = new Date(startDate.getTime() - 1).toISOString();

    const prevStmt = db.prepare(`
      SELECT SUM(duration_minutes) as total
      FROM time_entries
      WHERE start_time >= ? AND start_time <= ?
    `);
    prevStmt.bind([prevStart, prevEnd]);
    prevStmt.step();
    const prevResult = prevStmt.getAsObject() as any;
    prevStmt.free();
    const previousTotal = prevResult.total || 0;

    // Calculate trends
    const change = previousTotal > 0 
      ? Math.round(((totalMinutes - previousTotal) / previousTotal) * 100)
      : 0;

    // Top notes/tasks
    const notesStmt = db.prepare(`
      SELECT note, COUNT(*) as count, SUM(duration_minutes) as total_minutes
      FROM time_entries
      WHERE start_time >= ? AND start_time <= ? AND note IS NOT NULL AND note != ''
      GROUP BY note
      ORDER BY total_minutes DESC
      LIMIT 10
    `);
    notesStmt.bind([start, end]);
    const topNotes: any[] = [];
    while (notesStmt.step()) {
      topNotes.push(notesStmt.getAsObject());
    }
    notesStmt.free();

    res.json({
      period: { start, end },
      summary: {
        totalMinutes,
        totalEntries: entries.length,
        avgMinutesPerDay: Object.keys(dailyTotals).length > 0 
          ? Math.round(totalMinutes / Object.keys(dailyTotals).length)
          : 0,
        previousTotal,
        change
      },
      byCategory: Object.values(categoryTotals).sort((a, b) => b.minutes - a.minutes),
      daily: Object.values(dailyTotals).sort((a, b) => a.date.localeCompare(b.date)),
      topNotes
    });
  } catch (error) {
    logger.error('Error fetching analytics', { error });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
