import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Export data as JSON (existing functionality)
router.get('/', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    
    const categoriesResult = db.exec(
      `SELECT id, name, color, created_at FROM categories WHERE user_id = ?`,
      [req.userId as number]
    );
    
    const categories = categoriesResult.length > 0
      ? categoriesResult[0].values.map(row => ({
          id: row[0] as number,
          name: row[1] as string,
          color: row[2] as string | null,
          created_at: row[3] as string
        }))
      : [];

    const entriesResult = db.exec(`
      SELECT te.id, te.category_id, c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes, te.created_at
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ?
      ORDER BY te.start_time DESC
    `, [req.userId as number]);

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

// Export time entries as CSV
router.get('/csv', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    
    const entriesResult = db.exec(`
      SELECT c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time, te.duration_minutes
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ?
      ORDER BY te.start_time DESC
    `, [req.userId as number]);

    const rows = entriesResult.length > 0 ? entriesResult[0].values : [];
    
    // CSV header
    const csvHeader = 'Category,Color,Note,Start Time,End Time,Duration (minutes)';
    
    // CSV rows - escape fields properly
    const csvRows = rows.map(row => {
      const category = escapeCSV(row[0] as string);
      const color = escapeCSV(row[1] as string | null);
      const note = escapeCSV(row[2] as string | null);
      const startTime = row[3] as string;
      const endTime = row[4] as string | null || '';
      const duration = row[5] as number | null || '';
      return `${category},${color},${note},${startTime},${endTime},${duration}`;
    });

    const csv = [csvHeader, ...csvRows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chronoflow-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Error exporting CSV', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Import time entries from CSV
router.post('/csv', (req: AuthRequest, res: Response) => {
  try {
    const { csv } = req.body;
    
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    const db = getDb();
    const lines = csv.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header and at least one data row' });
    }

    // Parse header to validate format
    const header = parseCSVLine(lines[0]);
    
    if (header.length < 4) {
      return res.status(400).json({ error: 'Invalid CSV format. Expected columns: Category, Color, Note, Start Time, End Time, Duration (minutes)' });
    }

    // Get existing categories for this user
    const categoriesResult = db.exec(
      `SELECT id, name, color FROM categories WHERE user_id = ?`,
      [req.userId as number]
    );
    
    const categoryMap = new Map<string, { id: number; color: string | null }>();
    if (categoriesResult.length > 0) {
      categoriesResult[0].values.forEach(row => {
        categoryMap.set((row[1] as string).toLowerCase(), { 
          id: row[0] as number, 
          color: row[2] as string | null 
        });
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      
      if (row.length < 4) {
        errors.push(`Row ${i + 1}: Not enough columns`);
        skipped++;
        continue;
      }

      const [categoryName, color, note, startTime, endTime] = row;
      
      if (!categoryName || !startTime) {
        errors.push(`Row ${i + 1}: Category and Start Time are required`);
        skipped++;
        continue;
      }

      // Validate dates
      const startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        errors.push(`Row ${i + 1}: Invalid start time format`);
        skipped++;
        continue;
      }

      let endDate: Date | null = null;
      if (endTime) {
        endDate = new Date(endTime);
        if (isNaN(endDate.getTime())) {
          errors.push(`Row ${i + 1}: Invalid end time format`);
          skipped++;
          continue;
        }
      }

      // Find or create category
      let categoryId: number;
      const existingCategory = categoryMap.get(categoryName.toLowerCase());
      
      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        // Create new category
        db.run(
          `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
          [req.userId as number, categoryName, color || null]
        );
        const idResult = db.exec(`SELECT last_insert_rowid() as id`);
        categoryId = idResult[0].values[0][0] as number;
        categoryMap.set(categoryName.toLowerCase(), { id: categoryId, color: color || null });
      }

      // Calculate duration
      let duration: number | null = null;
      if (endDate) {
        duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
      }

      // Insert time entry
      db.run(
        `INSERT INTO time_entries (user_id, category_id, note, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId as number, categoryId, note || null, startTime, endTime || null, duration]
      );
      imported++;
    }

    saveDatabase();
    
    logger.info('CSV import completed', { 
      userId: req.userId, 
      imported, 
      skipped,
      totalRows: lines.length - 1 
    });

    res.json({ 
      imported, 
      skipped, 
      errors: errors.slice(0, 10) // Return first 10 errors
    });
  } catch (error) {
    logger.error('Error importing CSV', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// Helper function to escape CSV fields
function escapeCSV(value: string | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper function to parse a CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
}

export default router;
