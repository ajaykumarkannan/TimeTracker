import { Router, Response } from 'express';
import { getDb, saveDatabase } from '../database';
import { logger } from '../logger';
import { flexAuthMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(flexAuthMiddleware);

// Export time entries as CSV
router.get('/csv', (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    
    const entriesResult = db.exec(`
      SELECT c.name as category_name, c.color as category_color,
             te.note, te.start_time, te.end_time
      FROM time_entries te
      JOIN categories c ON te.category_id = c.id
      WHERE te.user_id = ?
      ORDER BY te.start_time DESC
    `, [req.userId as number]);

    const rows = entriesResult.length > 0 ? entriesResult[0].values : [];
    
    // CSV header
    const csvHeader = 'Category,Color,Note,Start Time,End Time';
    
    // CSV rows - escape fields properly
    const csvRows = rows.map(row => {
      const category = escapeCSV(row[0] as string);
      const color = escapeCSV(row[1] as string | null);
      const note = escapeCSV(row[2] as string | null);
      const startTime = row[3] as string;
      const endTime = row[4] as string | null || '';
      return `${category},${color},${note},${startTime},${endTime}`;
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

// Preview CSV import (parse and return data for review)
router.post('/csv/preview', (req: AuthRequest, res: Response) => {
  try {
    const { csv, columnMapping, timeOffsetMinutes } = req.body;
    const offsetMs = (timeOffsetMinutes || 0) * 60 * 1000;
    
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    const lines = csv.split('\n').filter(line => line.trim());
    
    if (lines.length < 1) {
      return res.status(400).json({ error: 'CSV must have at least a header row' });
    }

    // Parse header
    const header = parseCSVLine(lines[0]);
    
    // If no mapping provided, return header for column selection
    if (!columnMapping) {
      // Try to auto-detect columns
      const autoMapping: { [key: string]: number } = {};
      const lowerHeader = header.map(h => h.toLowerCase());
      
      const categoryIndex = lowerHeader.findIndex(h => h.includes('category') || h.includes('task') || h.includes('project'));
      const noteIndex = lowerHeader.findIndex(h => h.includes('note') || h.includes('description') || h.includes('comment'));
      const startIndex = lowerHeader.findIndex(h => h.includes('start'));
      const endIndex = lowerHeader.findIndex(h => h.includes('end') || h.includes('stop'));
      const colorIndex = lowerHeader.findIndex(h => h.includes('color'));
      
      if (categoryIndex >= 0) autoMapping.category = categoryIndex;
      if (noteIndex >= 0) autoMapping.note = noteIndex;
      if (startIndex >= 0) autoMapping.startTime = startIndex;
      if (endIndex >= 0) autoMapping.endTime = endIndex;
      if (colorIndex >= 0) autoMapping.color = colorIndex;
      
      return res.json({
        headers: header,
        rowCount: lines.length - 1,
        suggestedMapping: autoMapping,
        preview: lines.slice(1, 6).map(line => parseCSVLine(line))
      });
    }

    // Parse with provided mapping
    const db = getDb();
    
    // Get existing categories
    const categoriesResult = db.exec(
      `SELECT id, name, color FROM categories WHERE user_id = ?`,
      [req.userId as number]
    );
    
    const existingCategories = new Map<string, { id: number; color: string | null }>();
    if (categoriesResult.length > 0) {
      categoriesResult[0].values.forEach(row => {
        existingCategories.set((row[1] as string).toLowerCase(), { 
          id: row[0] as number, 
          color: row[2] as string | null 
        });
      });
    }

    const entries: Array<{
      rowIndex: number;
      category: string;
      color: string | null;
      note: string | null;
      startTime: string;
      endTime: string | null;
      duration: number | null;
      isNewCategory: boolean;
      error: string | null;
    }> = [];

    const newCategories = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      
      const category = columnMapping.category !== undefined ? row[columnMapping.category]?.trim() : '';
      const color = columnMapping.color !== undefined ? row[columnMapping.color]?.trim() || null : null;
      const note = columnMapping.note !== undefined ? row[columnMapping.note]?.trim() || null : null;
      const startTimeStr = columnMapping.startTime !== undefined ? row[columnMapping.startTime]?.trim() : '';
      const endTimeStr = columnMapping.endTime !== undefined ? row[columnMapping.endTime]?.trim() || null : null;

      let error: string | null = null;
      let startTime = '';
      let endTime: string | null = null;
      let duration: number | null = null;

      // Validate category
      if (!category) {
        error = 'Category is required';
      }

      // Parse start time
      if (!error && startTimeStr) {
        const startDate = new Date(startTimeStr);
        if (isNaN(startDate.getTime())) {
          error = 'Invalid start time';
        } else {
          // Apply time offset
          const adjustedStart = new Date(startDate.getTime() - offsetMs);
          startTime = adjustedStart.toISOString();
        }
      } else if (!error) {
        error = 'Start time is required';
      }

      // Parse end time
      if (!error && endTimeStr) {
        const endDate = new Date(endTimeStr);
        if (isNaN(endDate.getTime())) {
          error = 'Invalid end time';
        } else {
          // Apply time offset
          const adjustedEnd = new Date(endDate.getTime() - offsetMs);
          endTime = adjustedEnd.toISOString();
          // Calculate duration for display only
          duration = Math.round((adjustedEnd.getTime() - new Date(startTime).getTime()) / 60000);
        }
      }

      const isNewCategory = category ? !existingCategories.has(category.toLowerCase()) : false;
      if (isNewCategory && category) {
        newCategories.add(category);
      }

      entries.push({
        rowIndex: i,
        category,
        color,
        note,
        startTime,
        endTime,
        duration,
        isNewCategory,
        error
      });
    }

    res.json({
      entries,
      newCategories: Array.from(newCategories),
      existingCategories: Array.from(existingCategories.keys()),
      validCount: entries.filter(e => !e.error).length,
      errorCount: entries.filter(e => e.error).length
    });
  } catch (error) {
    logger.error('Error previewing CSV', { error, userId: req.userId });
    res.status(500).json({ error: 'Failed to preview CSV' });
  }
});

// Import time entries from CSV (with optional entries override)
router.post('/csv', (req: AuthRequest, res: Response) => {
  try {
    const { csv, columnMapping, entries: overrideEntries } = req.body;
    
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
    
    // Determine column mapping
    let mapping = columnMapping;
    if (!mapping) {
      // Legacy format - assume fixed columns
      if (header.length < 4) {
        return res.status(400).json({ error: 'Invalid CSV format. Expected columns: Category, Color, Note, Start Time, End Time' });
      }
      mapping = { category: 0, color: 1, note: 2, startTime: 3, endTime: 4 };
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

    // Use override entries if provided (from preview/edit), otherwise parse CSV
    const entriesToImport = overrideEntries || lines.slice(1).map((line, index) => {
      const row = parseCSVLine(line);
      return {
        rowIndex: index + 1,
        category: mapping.category !== undefined ? row[mapping.category]?.trim() : '',
        color: mapping.color !== undefined ? row[mapping.color]?.trim() || null : null,
        note: mapping.note !== undefined ? row[mapping.note]?.trim() || null : null,
        startTime: mapping.startTime !== undefined ? row[mapping.startTime]?.trim() : '',
        endTime: mapping.endTime !== undefined ? row[mapping.endTime]?.trim() || null : null,
        skip: false
      };
    });

    // Process entries
    for (const entry of entriesToImport) {
      if (entry.skip) {
        skipped++;
        continue;
      }

      const { category, color, note, startTime, endTime } = entry;
      
      if (!category || !startTime) {
        errors.push(`Row ${entry.rowIndex}: Category and Start Time are required`);
        skipped++;
        continue;
      }

      // Validate dates
      const startDate = new Date(startTime);
      if (isNaN(startDate.getTime())) {
        errors.push(`Row ${entry.rowIndex}: Invalid start time format`);
        skipped++;
        continue;
      }

      let endDate: Date | null = null;
      if (endTime) {
        endDate = new Date(endTime);
        if (isNaN(endDate.getTime())) {
          errors.push(`Row ${entry.rowIndex}: Invalid end time format`);
          skipped++;
          continue;
        }
      }

      // Find or create category
      let categoryId: number;
      const existingCategory = categoryMap.get(category.toLowerCase());
      
      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        // Create new category with provided color or auto-generated one
        const categoryColor = color || generateCategoryColor(categoryMap.size);
        db.run(
          `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
          [req.userId as number, category, categoryColor]
        );
        const idResult = db.exec(`SELECT last_insert_rowid() as id`);
        categoryId = idResult[0].values[0][0] as number;
        categoryMap.set(category.toLowerCase(), { id: categoryId, color: categoryColor });
      }

      // Calculate duration for storage (cached value for analytics performance)
      let duration: number | null = null;
      if (endDate) {
        duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
      }

      // Insert time entry
      db.run(
        `INSERT INTO time_entries (user_id, category_id, note, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.userId as number, categoryId, note || null, startDate.toISOString(), endDate?.toISOString() || null, duration]
      );
      imported++;
    }

    saveDatabase();
    
    logger.info('CSV import completed', { 
      userId: req.userId, 
      imported, 
      skipped,
      totalRows: entriesToImport.length 
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

// Predefined colors for auto-generating category colors
const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#a855f7', // purple
  '#14b8a6', // teal
  '#ef4444', // red
  '#f97316', // orange
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#84cc16', // lime
  '#d946ef', // fuchsia
];

// Generate a color for a new category based on index
function generateCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export default router;
