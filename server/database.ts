import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { logger } from './logger';
import { config } from './config';
import { runMigrations, getCurrentVersion, LATEST_VERSION } from './migrations';
import * as fs from 'fs';
import * as path from 'path';

let db: SqlJsDatabase;
let autoSaveTimer: NodeJS.Timeout | null = null;
let pendingSave = false;

export async function initDatabase(): Promise<SqlJsDatabase> {
  logger.info('Initializing database', { path: config.dbPath });

  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing database or create new one
  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
    logger.info('Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info('Created new database');
  }

  // Run migrations
  runMigrations(db);
  
  const currentVersion = getCurrentVersion(db);
  logger.info(`Database ready at version ${currentVersion}/${LATEST_VERSION}`);

  // Start auto-save timer
  startAutoSave();
  
  // Initial save
  saveDatabaseNow();
  
  return db;
}

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Mark database as needing save (batched)
export function saveDatabase(): void {
  pendingSave = true;
}

// Force immediate save
export function saveDatabaseNow(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
    pendingSave = false;
    logger.debug('Database saved');
  }
}

function startAutoSave(): void {
  if (autoSaveTimer) return;
  
  autoSaveTimer = setInterval(() => {
    if (pendingSave && db) {
      saveDatabaseNow();
    }
  }, config.dbAutoSaveInterval);
}

// Graceful shutdown
export function shutdownDatabase(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (pendingSave && db) {
    saveDatabaseNow();
    logger.info('Database saved on shutdown');
  }
}

// Handle process signals
process.on('SIGINT', () => {
  shutdownDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdownDatabase();
  process.exit(0);
});

process.on('beforeExit', () => {
  shutdownDatabase();
});

// Type exports for database entities
export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface RefreshToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  user_id: number;
  category_id: number;
  note: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null; // Cached value, computed from start_time and end_time
  created_at: string;
}
