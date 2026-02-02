import { Database as SqlJsDatabase } from 'sql.js';
import { logger } from '../logger';

export interface Migration {
  version: number;
  name: string;
  up: (db: SqlJsDatabase) => void;
}

// Migration registry - add new migrations here
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Refresh tokens
      db.run(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Categories
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

      // Time entries
      db.run(`
        CREATE TABLE IF NOT EXISTS time_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          note TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          duration_minutes INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        )
      `);

      // Indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_user_start ON time_entries(user_id, start_time DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_user_end ON time_entries(user_id, end_time)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)`);
    }
  },
  // Add future migrations here:
  // {
  //   version: 2,
  //   name: 'add_tags_table',
  //   up: (db) => {
  //     db.run(`CREATE TABLE IF NOT EXISTS tags (...)`);
  //   }
  // },
  {
    version: 2,
    name: 'add_password_reset_tokens',
    up: (db) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id)`);
    }
  },
  {
    version: 3,
    name: 'add_user_settings',
    up: (db) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL UNIQUE,
          timezone TEXT DEFAULT 'UTC',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id)`);
    }
  },
  // Note: duration_minutes is kept as a cached/computed value for analytics query performance.
  // It's automatically calculated from start_time and end_time when entries are created/updated.
  // It's not included in CSV import/export since it can be derived from the timestamps.
];

export function runMigrations(db: SqlJsDatabase): void {
  // Create migrations tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version
  const result = db.exec(`SELECT MAX(version) as version FROM schema_migrations`);
  const currentVersion = result.length > 0 && result[0].values[0][0] !== null
    ? result[0].values[0][0] as number
    : 0;

  logger.info(`Database at version ${currentVersion}, latest is ${migrations.length}`);

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info(`Running migration ${migration.version}: ${migration.name}`);
      try {
        migration.up(db);
        db.run(
          `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
          [migration.version, migration.name]
        );
        logger.info(`Migration ${migration.version} completed`);
      } catch (error) {
        logger.error(`Migration ${migration.version} failed`, { error });
        throw error;
      }
    }
  }
}

export function getCurrentVersion(db: SqlJsDatabase): number {
  try {
    const result = db.exec(`SELECT MAX(version) as version FROM schema_migrations`);
    return result.length > 0 && result[0].values[0][0] !== null
      ? result[0].values[0][0] as number
      : 0;
  } catch {
    return 0;
  }
}

export const LATEST_VERSION = migrations.length;
