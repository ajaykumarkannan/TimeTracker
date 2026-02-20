import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config';
import { logger } from '../../logger';
import { runMigrations, getCurrentVersion, LATEST_VERSION } from '../../migrations';
import type {
  Category,
  CategorySummary,
  DailySummary,
  PasswordResetToken,
  RefreshToken,
  TaskNameStats,
  TimeEntryWithCategory,
  User,
  UserSettings
} from '../types';
import type {
  AnalyticsQueryParams,
  CategoryCreateInput,
  CategoryDrilldownParams,
  DatabaseProvider,
  TaskNamesQueryParams,
  TimeEntriesQueryParams,
  TimeEntryCreateInput,
  TimeEntryUpdateInput
} from '../provider';
import { TIME_ENTRIES_WITH_CATEGORIES_QUERY, rowToTimeEntry } from '../../utils/queryHelpers';

export function createSqliteProvider(): DatabaseProvider {
  let db: SqlJsDatabase | null = null;
  let autoSaveTimer: NodeJS.Timeout | null = null;
  let pendingSave = false;

  const ensureDb = () => {
    if (!db) {
      throw new Error('Database not initialized');
    }
    return db;
  };

  const scheduleSave = () => {
    pendingSave = true;
  };

  const saveNow = () => {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
    pendingSave = false;
    logger.debug('Database saved');
  };

  const startAutoSave = () => {
    if (autoSaveTimer) return;
    autoSaveTimer = setInterval(() => {
      if (pendingSave && db) {
        saveNow();
      }
    }, config.dbAutoSaveInterval);
  };

  const mapCategory = (row: unknown[]): Category => ({
    id: row[0] as number,
    user_id: row[1] as number,
    name: row[2] as string,
    color: row[3] as string | null,
    created_at: row[4] as string
  });

  const mapUser = (row: unknown[]): User => ({
    id: row[0] as number,
    email: row[1] as string,
    username: row[2] as string,
    password_hash: row[3] as string,
    created_at: row[4] as string,
    updated_at: row[5] as string
  });

  const mapRefreshToken = (row: unknown[]): RefreshToken => ({
    id: row[0] as number,
    user_id: row[1] as number,
    token: row[2] as string,
    expires_at: row[3] as string,
    created_at: row[4] as string
  });

  const mapPasswordResetToken = (row: unknown[]): PasswordResetToken => ({
    id: row[0] as number,
    user_id: row[1] as number,
    token: row[2] as string,
    expires_at: row[3] as string,
    created_at: row[4] as string
  });

  const mapUserSettings = (row: unknown[]): UserSettings => ({
    id: row[0] as number,
    user_id: row[1] as number,
    timezone: row[2] as string,
    created_at: row[3] as string,
    updated_at: row[4] as string
  });

  return {
    async init() {
      logger.info('Initializing SQLite database', { path: config.dbPath });
      const SQL = await initSqlJs();

      const dir = path.dirname(config.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(config.dbPath)) {
        const buffer = fs.readFileSync(config.dbPath);
        db = new SQL.Database(buffer);
        logger.info('Loaded existing database');
      } else {
        db = new SQL.Database();
        logger.info('Created new database');
      }

      runMigrations(db);
      startAutoSave();
      saveNow();
    },
    async shutdown() {
      if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
      }
      if (pendingSave && db) {
        saveNow();
        logger.info('Database saved on shutdown');
      }
    },
    async getCurrentVersion() {
      if (!db) return 0;
      return getCurrentVersion(db);
    },
    async getLatestVersion() {
      return LATEST_VERSION;
    },
    async findUserByEmail(email: string) {
      const result = ensureDb().exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE email = ?`,
        [email]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapUser(result[0].values[0]);
    },
    async findUserById(id: number) {
      const result = ensureDb().exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE id = ?`,
        [id]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapUser(result[0].values[0]);
    },
    async findUserByEmailExcludingId(email: string, excludeId: number) {
      const result = ensureDb().exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE email = ? AND id != ?`,
        [email, excludeId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapUser(result[0].values[0]);
    },
    async createUser(input: { email: string; username: string; password_hash: string }) {
      const dbRef = ensureDb();
      dbRef.run(
        `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`,
        [input.email, input.username, input.password_hash]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE email = ?`,
        [input.email]
      );
      return mapUser(result[0].values[0]);
    },
    async updateUser(id: number, input: { email?: string; username?: string; password_hash?: string }) {
      const dbRef = ensureDb();
      dbRef.run(
        `UPDATE users SET email = COALESCE(?, email), username = COALESCE(?, username), password_hash = COALESCE(?, password_hash) WHERE id = ?`,
        [input.email || null, input.username || null, input.password_hash || null, id]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users WHERE id = ?`,
        [id]
      );
      return mapUser(result[0].values[0]);
    },
    async deleteUser(userId: number) {
      const dbRef = ensureDb();
      dbRef.run(`DELETE FROM time_entries WHERE user_id = ?`, [userId]);
      dbRef.run(`DELETE FROM categories WHERE user_id = ?`, [userId]);
      dbRef.run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
      dbRef.run(`DELETE FROM users WHERE id = ?`, [userId]);
      scheduleSave();
    },
    async findAnonymousUserBySession(sessionId: string) {
      const email = `anon_${sessionId}@local`;
      return this.findUserByEmail(email);
    },
    async createAnonymousUser(sessionId: string) {
      const email = `anon_${sessionId}@local`;
      const shortId = sessionId.substring(0, 8);
      return this.createUser({
        email,
        username: `Guest_${shortId}`,
        password_hash: 'anonymous-no-password'
      });
    },
    async createRefreshToken(input: { user_id: number; token: string; expires_at: string }) {
      const dbRef = ensureDb();
      dbRef.run(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [input.user_id, input.token, input.expires_at]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, user_id, token, expires_at, created_at FROM refresh_tokens WHERE token = ?`,
        [input.token]
      );
      return mapRefreshToken(result[0].values[0]);
    },
    async findRefreshToken(token: string) {
      const result = ensureDb().exec(
        `SELECT id, user_id, token, expires_at, created_at FROM refresh_tokens WHERE token = ?`,
        [token]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapRefreshToken(result[0].values[0]);
    },
    async deleteRefreshTokenById(id: number) {
      ensureDb().run(`DELETE FROM refresh_tokens WHERE id = ?`, [id]);
      scheduleSave();
    },
    async deleteRefreshToken(token: string) {
      ensureDb().run(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
      scheduleSave();
    },
    async deleteRefreshTokensForUser(userId: number) {
      ensureDb().run(`DELETE FROM refresh_tokens WHERE user_id = ?`, [userId]);
      scheduleSave();
    },
    async upsertPasswordResetToken(input: { user_id: number; token: string; expires_at: string }) {
      const dbRef = ensureDb();
      dbRef.run(`DELETE FROM password_reset_tokens WHERE user_id = ?`, [input.user_id]);
      dbRef.run(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
        [input.user_id, input.token, input.expires_at]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, user_id, token, expires_at, created_at FROM password_reset_tokens WHERE token = ?`,
        [input.token]
      );
      return mapPasswordResetToken(result[0].values[0]);
    },
    async findPasswordResetToken(token: string) {
      const result = ensureDb().exec(
        `SELECT id, user_id, token, expires_at, created_at FROM password_reset_tokens WHERE token = ?`,
        [token]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapPasswordResetToken(result[0].values[0]);
    },
    async deletePasswordResetToken(token: string) {
      ensureDb().run(`DELETE FROM password_reset_tokens WHERE token = ?`, [token]);
      scheduleSave();
    },
    async deletePasswordResetTokensForUser(userId: number) {
      ensureDb().run(`DELETE FROM password_reset_tokens WHERE user_id = ?`, [userId]);
      scheduleSave();
    },
    async listCategories(userId: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, name, color, created_at FROM categories WHERE user_id = ? ORDER BY name`,
        [userId]
      );
      return result.length > 0 ? result[0].values.map(mapCategory) : [];
    },
    async findCategoryById(userId: number, id: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, name, color, created_at FROM categories WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapCategory(result[0].values[0]);
    },
    async findCategoryByName(userId: number, name: string) {
      const result = ensureDb().exec(
        `SELECT id, user_id, name, color, created_at FROM categories WHERE user_id = ? AND name = ?`,
        [userId, name]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapCategory(result[0].values[0]);
    },
    async createCategory(input: CategoryCreateInput) {
      const dbRef = ensureDb();
      dbRef.run(
        `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
        [input.user_id, input.name, input.color]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, user_id, name, color, created_at FROM categories WHERE user_id = ? AND name = ?`,
        [input.user_id, input.name]
      );
      return mapCategory(result[0].values[0]);
    },
    async updateCategory(userId: number, id: number, input: { name: string; color: string | null }) {
      const dbRef = ensureDb();
      dbRef.run(
        `UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?`,
        [input.name, input.color, id, userId]
      );
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, user_id, name, color, created_at FROM categories WHERE id = ?`,
        [id]
      );
      return mapCategory(result[0].values[0]);
    },
    async deleteCategory(userId: number, id: number) {
      ensureDb().run(`DELETE FROM categories WHERE id = ? AND user_id = ?`, [id, userId]);
      scheduleSave();
    },
    async countCategories(userId: number) {
      const result = ensureDb().exec(`SELECT COUNT(*) FROM categories WHERE user_id = ?`, [userId]);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    },
    async listTimeEntries(params: TimeEntriesQueryParams) {
      const dbRef = ensureDb();
      let query = TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.user_id = ?`;
      const sqlParams: (number | string)[] = [params.userId];

      if (params.startDate) {
        query += ` AND te.start_time >= ?`;
        sqlParams.push(params.startDate);
      }
      if (params.endDate) {
        query += ` AND te.start_time <= ?`;
        sqlParams.push(params.endDate);
      }
      if (params.categoryId) {
        query += ` AND te.category_id = ?`;
        sqlParams.push(params.categoryId);
      }
      if (params.searchQuery) {
        query += ` AND (LOWER(te.task_name) LIKE ? OR LOWER(c.name) LIKE ?)`;
        sqlParams.push(`%${params.searchQuery}%`, `%${params.searchQuery}%`);
      }

      query += ` ORDER BY te.start_time DESC LIMIT ? OFFSET ?`;
      sqlParams.push(params.limit, params.offset);

      const result = dbRef.exec(query, sqlParams);
      if (result.length === 0 || result[0].values.length === 0) return [];
      return result[0].values.map(rowToTimeEntry);
    },
    async getActiveTimeEntry(userId: number) {
      const result = ensureDb().exec(
        TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.user_id = ? AND te.end_time IS NULL LIMIT 1`,
        [userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return rowToTimeEntry(result[0].values[0]) as TimeEntryWithCategory;
    },
    async findTimeEntryById(userId: number, id: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, category_id, task_name, start_time, end_time, scheduled_end_time, duration_minutes, created_at FROM time_entries WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      return {
        id: row[0] as number,
        user_id: row[1] as number,
        category_id: row[2] as number,
        task_name: row[3] as string | null,
        start_time: row[4] as string,
        end_time: row[5] as string | null,
        scheduled_end_time: row[6] as string | null,
        duration_minutes: row[7] as number | null,
        created_at: row[8] as string
      };
    },
    async findTimeEntryWithCategoryById(userId: number, id: number) {
      const result = ensureDb().exec(
        TIME_ENTRIES_WITH_CATEGORIES_QUERY + ` WHERE te.id = ? AND te.user_id = ?`,
        [id, userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return rowToTimeEntry(result[0].values[0]) as TimeEntryWithCategory;
    },
    async findActiveTimeEntry(userId: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, category_id, task_name, start_time, end_time, scheduled_end_time, duration_minutes, created_at FROM time_entries WHERE user_id = ? AND end_time IS NULL LIMIT 1`,
        [userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      return {
        id: row[0] as number,
        user_id: row[1] as number,
        category_id: row[2] as number,
        task_name: row[3] as string | null,
        start_time: row[4] as string,
        end_time: row[5] as string | null,
        scheduled_end_time: row[6] as string | null,
        duration_minutes: row[7] as number | null,
        created_at: row[8] as string
      };
    },
    async createTimeEntry(input: TimeEntryCreateInput) {
      const dbRef = ensureDb();
      dbRef.run(
        `INSERT INTO time_entries (user_id, category_id, task_name, start_time, end_time, scheduled_end_time, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.user_id,
          input.category_id,
          input.task_name,
          input.start_time,
          input.end_time,
          input.scheduled_end_time,
          input.duration_minutes
        ]
      );
      scheduleSave();
      const result = dbRef.exec(`SELECT last_insert_rowid() as id`);
      const newId = result[0].values[0][0] as number;
      const created = await this.findTimeEntryById(input.user_id, newId);
      if (!created) {
        throw new Error('Failed to create time entry');
      }
      return created;
    },
    async updateTimeEntry(userId: number, id: number, input: TimeEntryUpdateInput) {
      const dbRef = ensureDb();
      dbRef.run(
        `UPDATE time_entries
         SET category_id = COALESCE(?, category_id),
             task_name = COALESCE(?, task_name),
             start_time = COALESCE(?, start_time),
             end_time = ?,
             scheduled_end_time = ?,
             duration_minutes = ?
         WHERE id = ? AND user_id = ?`,
        [
          input.category_id ?? null,
          input.task_name ?? null,
          input.start_time ?? null,
          input.end_time ?? null,
          input.scheduled_end_time ?? null,
          input.duration_minutes ?? null,
          id,
          userId
        ]
      );
      scheduleSave();
    },
    async updateTimeEntriesByTaskName(userId: number, oldTaskName: string, updates: { task_name?: string; category_id?: number }) {
      const dbRef = ensureDb();
      const setClauses: string[] = [];
      const params: (string | number)[] = [];
      if (updates.task_name !== undefined) {
        setClauses.push('task_name = ?');
        params.push(updates.task_name);
      }
      if (updates.category_id !== undefined) {
        setClauses.push('category_id = ?');
        params.push(updates.category_id);
      }
      if (setClauses.length === 0) {
        return 0;
      }
      params.push(oldTaskName, userId);
      dbRef.run(
        `UPDATE time_entries SET ${setClauses.join(', ')} WHERE task_name = ? AND user_id = ?`,
        params
      );
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async updateTimeEntriesForMerge(userId: number, sourceTaskNames: string[], updates: { task_name: string; category_id?: number }) {
      const dbRef = ensureDb();
      const placeholders = sourceTaskNames.map(() => '?').join(', ');
      const params: (string | number)[] = [];
      let query = 'UPDATE time_entries SET task_name = ?';
      params.push(updates.task_name);
      if (updates.category_id !== undefined) {
        query += ', category_id = ?';
        params.push(updates.category_id);
      }
      query += ` WHERE user_id = ? AND task_name IN (${placeholders})`;
      params.push(userId, ...sourceTaskNames);
      dbRef.run(query, params);
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async updateTimeEntriesForBulkUpdate(userId: number, oldTaskName: string, oldCategoryId: number, updates: { task_name: string; category_id: number }) {
      const dbRef = ensureDb();
      dbRef.run(
        `UPDATE time_entries SET task_name = ?, category_id = ? WHERE user_id = ? AND task_name = ? AND category_id = ?`,
        [updates.task_name, updates.category_id, userId, oldTaskName, oldCategoryId]
      );
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async countTimeEntriesByTaskNames(userId: number, taskNames: string[]) {
      if (taskNames.length === 0) return 0;
      const dbRef = ensureDb();
      const placeholders = taskNames.map(() => '?').join(', ');
      const result = dbRef.exec(
        `SELECT COUNT(*) as count FROM time_entries WHERE user_id = ? AND task_name IN (${placeholders})`,
        [userId, ...taskNames]
      );
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    },
    async countTimeEntriesByTaskNameAndCategory(userId: number, taskName: string, categoryId: number) {
      const result = ensureDb().exec(
        `SELECT COUNT(*) as count FROM time_entries WHERE user_id = ? AND task_name = ? AND category_id = ?`,
        [userId, taskName, categoryId]
      );
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    },
    async deleteTimeEntry(userId: number, id: number) {
      ensureDb().run(`DELETE FROM time_entries WHERE id = ? AND user_id = ?`, [id, userId]);
      scheduleSave();
    },
    async deleteTimeEntriesForUser(userId: number) {
      const dbRef = ensureDb();
      dbRef.run(`DELETE FROM time_entries WHERE user_id = ?`, [userId]);
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async deleteTimeEntriesByCategory(userId: number, categoryId: number) {
      const dbRef = ensureDb();
      dbRef.run(`DELETE FROM time_entries WHERE user_id = ? AND category_id = ?`, [userId, categoryId]);
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async deleteCategoriesForUser(userId: number) {
      const dbRef = ensureDb();
      dbRef.run(`DELETE FROM categories WHERE user_id = ?`, [userId]);
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async deleteTimeEntriesByDate(userId: number, startOfDay: string, endOfDay: string) {
      const dbRef = ensureDb();
      dbRef.run(
        `DELETE FROM time_entries WHERE user_id = ? AND start_time >= ? AND start_time <= ? AND end_time IS NOT NULL`,
        [userId, startOfDay, endOfDay]
      );
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async reassignTimeEntriesCategory(userId: number, fromCategoryId: number, toCategoryId: number) {
      const dbRef = ensureDb();
      dbRef.run(
        `UPDATE time_entries SET category_id = ? WHERE category_id = ? AND user_id = ?`,
        [toCategoryId, fromCategoryId, userId]
      );
      const countResult = dbRef.exec(`SELECT changes() as count`);
      scheduleSave();
      return countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
    },
    async countTimeEntriesForCategory(userId: number, categoryId: number) {
      const result = ensureDb().exec(
        `SELECT COUNT(*) FROM time_entries WHERE category_id = ? AND user_id = ?`,
        [categoryId, userId]
      );
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    },
    async listTaskSuggestions(userId: number, categoryId: number | null, query: string, limit: number) {
      const dbRef = ensureDb();
      let sql = `
        SELECT task_name, category_id, COUNT(*) as count, SUM(duration_minutes) as total_minutes, MAX(start_time) as last_used
        FROM time_entries
        WHERE user_id = ? AND task_name IS NOT NULL AND task_name != ''
      `;
      const params: (number | string)[] = [userId];

      if (categoryId) {
        sql += ` AND category_id = ?`;
        params.push(categoryId);
      }

      if (query) {
        sql += ` AND LOWER(task_name) LIKE ?`;
        params.push(`%${query}%`);
      }

      sql += ` GROUP BY task_name, category_id ORDER BY count DESC, total_minutes DESC LIMIT ?`;
      params.push(limit);

      const result = dbRef.exec(sql, params);
      if (result.length === 0) return [];
      return result[0].values.map(row => ({
        task_name: row[0] as string,
        categoryId: row[1] as number,
        count: row[2] as number,
        totalMinutes: row[3] as number,
        lastUsed: row[4] as string
      }));
    },
    async listTaskNames(params: TaskNamesQueryParams) {
      const dbRef = ensureDb();
      let whereClause = `te.user_id = ? AND te.start_time >= ? AND te.start_time < ? AND te.task_name IS NOT NULL AND te.task_name != ''`;
      const countParams: (number | string)[] = [params.userId, params.start, params.end];
      const queryParams: (number | string)[] = [params.userId, params.start, params.end];

      if (params.searchQuery) {
        whereClause += ` AND (LOWER(te.task_name) LIKE ? OR LOWER(c.name) LIKE ?)`;
        countParams.push(`%${params.searchQuery}%`, `%${params.searchQuery}%`);
        queryParams.push(`%${params.searchQuery}%`, `%${params.searchQuery}%`);
      }
      if (params.categoryFilter) {
        whereClause += ` AND c.name = ?`;
        countParams.push(params.categoryFilter);
        queryParams.push(params.categoryFilter);
      }

      const countResult = dbRef.exec(`
        SELECT COUNT(DISTINCT te.task_name || '|' || c.name) as total
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE ${whereClause}
      `, countParams);
      const totalCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

      let orderBy = 'total_minutes DESC, count DESC';
      if (params.sortBy === 'alpha') orderBy = 'task_name ASC';
      if (params.sortBy === 'count') orderBy = 'count DESC, total_minutes DESC';
      if (params.sortBy === 'recent') orderBy = 'last_used DESC, total_minutes DESC';

      queryParams.push(params.pageSize, (params.page - 1) * params.pageSize);

      const taskNamesResult = dbRef.exec(`
        SELECT te.task_name, COUNT(*) as count, COALESCE(SUM(te.duration_minutes), 0) as total_minutes, MAX(te.start_time) as last_used,
               c.name as category_name, c.color as category_color
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE ${whereClause}
        GROUP BY te.task_name, c.name, c.color
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `, queryParams);

      const taskNames = taskNamesResult.length > 0
        ? taskNamesResult[0].values.map(row => ({
            task_name: row[0] as string,
            count: row[1] as number,
            total_minutes: row[2] as number,
            last_used: row[3] as string,
            category_name: row[4] as string,
            category_color: row[5] as string | null
          }))
        : [];

      return { taskNames, totalCount };
    },
    async getCategoryDrilldown(params: CategoryDrilldownParams) {
      const dbRef = ensureDb();
      const categoryResult = dbRef.exec(`
        SELECT c.name, c.color, COALESCE(SUM(te.duration_minutes), 0) as minutes, COUNT(te.id) as count
        FROM categories c
        LEFT JOIN time_entries te ON c.id = te.category_id
          AND te.start_time >= ? AND te.start_time < ?
          AND te.user_id = ?
        WHERE c.user_id = ? AND c.name = ?
        GROUP BY c.id, c.name, c.color
      `, [params.start, params.end, params.userId, params.userId, params.categoryName]);

      if (categoryResult.length === 0 || categoryResult[0].values.length === 0) {
        throw new Error('Category not found');
      }

      const categoryRow = categoryResult[0].values[0];
      const category: CategorySummary = {
        name: categoryRow[0] as string,
        color: (categoryRow[1] as string) || '#6b7280',
        minutes: categoryRow[2] as number,
        count: categoryRow[3] as number
      };

      const countResult = dbRef.exec(`
        SELECT COUNT(DISTINCT te.task_name) as total
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ?
          AND c.name = ?
          AND te.task_name IS NOT NULL AND te.task_name != ''
      `, [params.userId, params.start, params.end, params.categoryName]);
      const totalCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

      const taskNamesResult = dbRef.exec(`
        SELECT te.task_name, COUNT(*) as count, COALESCE(SUM(te.duration_minutes), 0) as total_minutes
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ?
          AND c.name = ?
          AND te.task_name IS NOT NULL AND te.task_name != ''
        GROUP BY te.task_name
        ORDER BY total_minutes DESC, count DESC
        LIMIT ? OFFSET ?
      `, [params.userId, params.start, params.end, params.categoryName, params.pageSize, (params.page - 1) * params.pageSize]);

      const taskNames = taskNamesResult.length > 0
        ? taskNamesResult[0].values.map(row => ({
            task_name: row[0] as string,
            count: row[1] as number,
            total_minutes: row[2] as number
          }))
        : [];

      return { category, taskNames, totalCount };
    },
    async getAnalyticsSummary(params: AnalyticsQueryParams) {
      const dbRef = ensureDb();
      const offsetHours = -params.timezoneOffset / 60;
      const offsetSign = offsetHours >= 0 ? '+' : '';
      const dateAdjustment = `datetime(start_time, '${offsetSign}${offsetHours} hours')`;

      const categoryResult = dbRef.exec(`
        SELECT c.name, c.color, COALESCE(SUM(te.duration_minutes), 0) as minutes, COUNT(te.id) as count
        FROM categories c
        LEFT JOIN time_entries te ON c.id = te.category_id
          AND te.start_time >= ? AND te.start_time < ?
          AND te.user_id = ?
        WHERE c.user_id = ?
        GROUP BY c.id, c.name, c.color
        ORDER BY minutes DESC
      `, [params.start, params.end, params.userId, params.userId]);

      const byCategory: CategorySummary[] = categoryResult.length > 0
        ? categoryResult[0].values.map(row => ({
            name: row[0] as string,
            color: (row[1] as string) || '#6b7280',
            minutes: row[2] as number,
            count: row[3] as number
          }))
        : [];

      const dailyResult = dbRef.exec(`
        SELECT DATE(${dateAdjustment}) as date, COALESCE(SUM(duration_minutes), 0) as minutes
        FROM time_entries
        WHERE user_id = ? AND start_time >= ? AND start_time < ?
        GROUP BY DATE(${dateAdjustment})
        ORDER BY date
      `, [params.userId, params.start, params.end]);

      const dailyByCategoryResult = dbRef.exec(`
        SELECT DATE(${dateAdjustment}) as date, c.name, COALESCE(SUM(te.duration_minutes), 0) as minutes
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE te.user_id = ? AND te.start_time >= ? AND te.start_time < ?
        GROUP BY DATE(${dateAdjustment}), c.name
        ORDER BY date, minutes DESC
      `, [params.userId, params.start, params.end]);

      const dailyByCategoryMap: Record<string, Record<string, number>> = {};
      if (dailyByCategoryResult.length > 0) {
        for (const row of dailyByCategoryResult[0].values) {
          const date = row[0] as string;
          const categoryName = row[1] as string;
          const minutes = row[2] as number;
          if (!dailyByCategoryMap[date]) {
            dailyByCategoryMap[date] = {};
          }
          dailyByCategoryMap[date][categoryName] = minutes;
        }
      }

      const daily: DailySummary[] = dailyResult.length > 0
        ? dailyResult[0].values.map(row => ({
            date: row[0] as string,
            minutes: row[1] as number,
            byCategory: dailyByCategoryMap[row[0] as string] || {}
          }))
        : [];

      const taskNamesResult = dbRef.exec(`
        SELECT task_name, COUNT(*) as count, COALESCE(SUM(duration_minutes), 0) as total_minutes
        FROM time_entries
        WHERE user_id = ? AND start_time >= ? AND start_time < ? AND task_name IS NOT NULL AND task_name != ''
        GROUP BY task_name
        ORDER BY count DESC
        LIMIT 10
      `, [params.userId, params.start, params.end]);

      const topTasks: TaskNameStats[] = taskNamesResult.length > 0
        ? taskNamesResult[0].values.map(row => ({
            task_name: row[0] as string,
            count: row[1] as number,
            total_minutes: row[2] as number
          }))
        : [];

      const prevResult = dbRef.exec(`
        SELECT COALESCE(SUM(duration_minutes), 0) as total
        FROM time_entries
        WHERE user_id = ? AND start_time >= ? AND start_time < ?
      `, [params.userId, params.start, params.end]);
      const previousTotal = prevResult.length > 0 ? (prevResult[0].values[0][0] as number) : 0;

      return { byCategory, daily, topTasks, previousTotal };
    },
    async listExportRows(userId: number) {
      const entriesResult = ensureDb().exec(`
        SELECT c.name as category_name, c.color as category_color,
               te.task_name, te.start_time, te.end_time
        FROM time_entries te
        JOIN categories c ON te.category_id = c.id
        WHERE te.user_id = ?
        ORDER BY te.start_time DESC
      `, [userId]);
      if (entriesResult.length === 0) return [];
      return entriesResult[0].values.map(row => ({
        category_name: row[0] as string,
        category_color: row[1] as string | null,
        task_name: row[2] as string | null,
        start_time: row[3] as string,
        end_time: row[4] as string | null
      }));
    },
    async getUserSettings(userId: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, timezone, created_at, updated_at FROM user_settings WHERE user_id = ?`,
        [userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return null;
      return mapUserSettings(result[0].values[0]);
    },
    async upsertUserSettings(userId: number, timezone: string) {
      const dbRef = ensureDb();
      const existing = dbRef.exec(`SELECT id FROM user_settings WHERE user_id = ?`, [userId]);
      if (existing.length === 0 || existing[0].values.length === 0) {
        dbRef.run(`INSERT INTO user_settings (user_id, timezone) VALUES (?, ?)`, [userId, timezone]);
      } else {
        dbRef.run(`UPDATE user_settings SET timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`, [timezone, userId]);
      }
      scheduleSave();
      const result = dbRef.exec(
        `SELECT id, user_id, timezone, created_at, updated_at FROM user_settings WHERE user_id = ?`,
        [userId]
      );
      return mapUserSettings(result[0].values[0]);
    },
    async createDefaultCategories(userId: number) {
      const dbRef = ensureDb();
      const defaults = [
        { name: 'Meetings', color: '#6366f1' },
        { name: 'Deep Work', color: '#10b981' },
        { name: 'Email & Communication', color: '#f59e0b' },
        { name: 'Planning', color: '#8b5cf6' },
        { name: 'Break', color: '#64748b' }
      ];
      for (const cat of defaults) {
        try {
          dbRef.run(
            `INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?)`,
            [userId, cat.name, cat.color]
          );
        } catch {
          // ignore duplicates
        }
      }
      scheduleSave();
      logger.info('Created default categories', { userId });
    },
    async listUsersForMigration() {
      const result = ensureDb().exec(
        `SELECT id, email, username, password_hash, created_at, updated_at FROM users`
      );
      if (result.length === 0 || result[0].values.length === 0) return [];
      return result[0].values.map(mapUser);
    },
    async listCategoriesForMigration(userId: number) {
      return this.listCategories(userId);
    },
    async listTimeEntriesForMigration(userId: number) {
      const result = ensureDb().exec(
        `SELECT id, user_id, category_id, task_name, start_time, end_time, scheduled_end_time, duration_minutes, created_at FROM time_entries WHERE user_id = ?`,
        [userId]
      );
      if (result.length === 0 || result[0].values.length === 0) return [];
      return result[0].values.map(row => ({
        id: row[0] as number,
        user_id: row[1] as number,
        category_id: row[2] as number,
        task_name: row[3] as string | null,
        start_time: row[4] as string,
        end_time: row[5] as string | null,
        scheduled_end_time: row[6] as string | null,
        duration_minutes: row[7] as number | null,
        created_at: row[8] as string
      }));
    },
    async getUserSettingsForMigration(userId: number) {
      return this.getUserSettings(userId);
    }
  };
}
