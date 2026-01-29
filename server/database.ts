import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = process.env.DB_PATH || './data/timetracker.db';

let db: SqlJsDatabase;

export async function initDatabase(): Promise<SqlJsDatabase> {
  logger.info('Initializing database', { path: DB_PATH });

  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      note TEXT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_minutes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);

  saveDatabase();
  logger.info('Database initialized successfully');
  return db;
}

export function getDb(): SqlJsDatabase {
  return db;
}

export function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  category_id: number;
  note: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  created_at: string;
}
