import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import initSqlJs, { Database } from 'sql.js';

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

let db: Database;
const testUserId = 1;

// Helper functions from export.ts
function escapeCSV(value: string | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      task_name TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_minutes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);
  
  db.run(`INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
    [testUserId, 'test@example.com', 'testuser', 'hash']);
});

beforeEach(() => {
  db.run('DELETE FROM time_entries');
  db.run('DELETE FROM categories');
});

describe('CSV Export/Import', () => {
  describe('escapeCSV', () => {
    it('returns empty string for null', () => {
      expect(escapeCSV(null)).toBe('');
    });

    it('returns plain string when no special chars', () => {
      expect(escapeCSV('Hello World')).toBe('Hello World');
    });

    it('wraps string with commas in quotes', () => {
      expect(escapeCSV('Hello, World')).toBe('"Hello, World"');
    });

    it('escapes double quotes', () => {
      expect(escapeCSV('Say "Hello"')).toBe('"Say ""Hello"""');
    });

    it('wraps string with newlines in quotes', () => {
      expect(escapeCSV('Line1\nLine2')).toBe('"Line1\nLine2"');
    });
  });

  describe('parseCSVLine', () => {
    it('parses simple CSV line', () => {
      expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles quoted fields', () => {
      expect(parseCSVLine('"Hello, World",b,c')).toEqual(['Hello, World', 'b', 'c']);
    });

    it('handles escaped quotes', () => {
      expect(parseCSVLine('"Say ""Hello""",b,c')).toEqual(['Say "Hello"', 'b', 'c']);
    });

    it('handles empty fields', () => {
      expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('trims whitespace', () => {
      expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Export Data', () => {
    it('exports categories and time entries', () => {
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)', 
        [testUserId, 'Development', '#007bff']);
      const categoryId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
      
      db.run(`INSERT INTO time_entries (user_id, category_id, task_name, start_time, end_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        [testUserId, categoryId, 'Working on feature', '2024-01-15T09:00:00Z', '2024-01-15T10:30:00Z', 90]);

      const categoriesResult = db.exec(
        `SELECT id, name, color FROM categories WHERE user_id = ?`,
        [testUserId]
      );
      
      const entriesResult = db.exec(`
        SELECT c.name, c.color, te.task_name, te.start_time, te.end_time, te.duration_minutes
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE te.user_id = ?
      `, [testUserId]);

      expect(categoriesResult[0].values).toHaveLength(1);
      expect(entriesResult[0].values).toHaveLength(1);
      expect(entriesResult[0].values[0][0]).toBe('Development');
      expect(entriesResult[0].values[0][5]).toBe(90);
    });
  });

  describe('Import Data', () => {
    it('imports time entries and creates missing categories', () => {
      // Simulate CSV import logic
      const csvData = `Category,Color,Task,Start Time,End Time,Duration (minutes)
Development,#007bff,Working on feature,2024-01-15T09:00:00Z,2024-01-15T10:30:00Z,90`;
      
      const lines = csvData.split('\n').filter(line => line.trim());
      const dataRow = parseCSVLine(lines[1]);
      
      const [categoryName, color, taskName, startTime, endTime] = dataRow;
      
      // Create category
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)',
        [testUserId, categoryName, color]);
      const categoryId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
      
      // Create time entry
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      const duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
      
      db.run(`INSERT INTO time_entries (user_id, category_id, task_name, start_time, end_time, duration_minutes) 
              VALUES (?, ?, ?, ?, ?, ?)`,
        [testUserId, categoryId, taskName, startTime, endTime, duration]);

      // Verify
      const entries = db.exec(`SELECT * FROM time_entries WHERE user_id = ?`, [testUserId]);
      expect(entries[0].values).toHaveLength(1);
      
      const categories = db.exec(`SELECT * FROM categories WHERE user_id = ?`, [testUserId]);
      expect(categories[0].values).toHaveLength(1);
    });

    it('reuses existing categories on import', () => {
      // Create existing category
      db.run('INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)',
        [testUserId, 'Development', '#007bff']);
      
      const existingCategories = db.exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [testUserId]);
      expect(existingCategories[0].values[0][0]).toBe(1);
      
      // Import would find existing category by name (case-insensitive)
      const categoryResult = db.exec(
        `SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?)`,
        [testUserId, 'development']
      );
      
      expect(categoryResult[0].values).toHaveLength(1);
    });
  });

  describe('Timezone Handling', () => {
    // Mirror the helper functions from export.ts for testing
    function hasTimezoneIndicator(timestamp: string): boolean {
      return /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(timestamp.trim());
    }

    function parseTimestamp(raw: string, offsetMs: number): Date {
      const date = new Date(raw);
      if (hasTimezoneIndicator(raw)) {
        return date;
      }
      return new Date(date.getTime() - offsetMs);
    }

    describe('hasTimezoneIndicator', () => {
      it('detects Z suffix', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00.000Z')).toBe(true);
        expect(hasTimezoneIndicator('2024-01-15T09:00:00Z')).toBe(true);
      });

      it('detects +HH:MM offset', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00+05:30')).toBe(true);
        expect(hasTimezoneIndicator('2024-01-15T09:00:00+00:00')).toBe(true);
      });

      it('detects -HH:MM offset', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00-05:00')).toBe(true);
        expect(hasTimezoneIndicator('2024-01-15T09:00:00-08:00')).toBe(true);
      });

      it('detects +HHMM offset (no colon)', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00+0530')).toBe(true);
      });

      it('returns false for timestamps without timezone', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00')).toBe(false);
        expect(hasTimezoneIndicator('2024-01-15 09:00:00')).toBe(false);
        expect(hasTimezoneIndicator('Jan 15, 2024 9:00 AM')).toBe(false);
      });

      it('handles whitespace', () => {
        expect(hasTimezoneIndicator('2024-01-15T09:00:00Z ')).toBe(true);
        expect(hasTimezoneIndicator(' 2024-01-15T09:00:00+05:30 ')).toBe(true);
      });
    });

    describe('parseTimestamp', () => {
      const UTC_MINUS_5_MS = -300 * 60 * 1000; // UTC-5 (Eastern)
      const UTC_PLUS_530_MS = 330 * 60 * 1000;  // UTC+5:30 (Mumbai)

      it('does NOT apply offset to UTC timestamps (Z suffix)', () => {
        // This is the core bug fix: re-importing a ChronoFlow export should preserve timestamps
        const result = parseTimestamp('2024-01-15T14:00:00.000Z', UTC_MINUS_5_MS);
        expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z');
      });

      it('does NOT apply offset to timestamps with explicit +offset', () => {
        // 09:00 in UTC+05:30 = 03:30 UTC; offset should NOT be applied again
        const result = parseTimestamp('2024-01-15T09:00:00+05:30', UTC_PLUS_530_MS);
        expect(result.toISOString()).toBe('2024-01-15T03:30:00.000Z');
      });

      it('does NOT apply offset to timestamps with explicit -offset', () => {
        // 09:00 in UTC-05:00 = 14:00 UTC; offset should NOT be applied again
        const result = parseTimestamp('2024-01-15T09:00:00-05:00', UTC_MINUS_5_MS);
        expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z');
      });

      it('DOES apply offset to timestamps without timezone info', () => {
        // "09:00" with no TZ info, user says they're in UTC+05:30 (offset 330 min)
        // new Date() parsing of bare ISO strings is platform-dependent (may be local or UTC).
        // The key invariant: parseTimestamp should subtract the offset from whatever Date parsed.
        const raw = '2024-01-15T09:00:00';
        const offsetMs = 330 * 60 * 1000; // UTC+05:30
        const naiveParse = new Date(raw); // platform-dependent
        const expected = new Date(naiveParse.getTime() - offsetMs);

        const result = parseTimestamp(raw, offsetMs);
        expect(result.toISOString()).toBe(expected.toISOString());
      });

      it('round-trip: export then re-import preserves UTC timestamps', () => {
        // Simulate what ChronoFlow stores in DB (UTC with Z)
        const dbTimestamp = '2024-01-15T14:00:00.000Z';
        
        // Export emits this raw (no conversion)
        const csvTimestamp = dbTimestamp;
        
        // Re-import with any timezone offset should preserve the original time
        const eastern = parseTimestamp(csvTimestamp, -300 * 60 * 1000);
        const mumbai = parseTimestamp(csvTimestamp, 330 * 60 * 1000);
        const utc = parseTimestamp(csvTimestamp, 0);
        
        expect(eastern.toISOString()).toBe(dbTimestamp);
        expect(mumbai.toISOString()).toBe(dbTimestamp);
        expect(utc.toISOString()).toBe(dbTimestamp);
      });
    });
  });
});
