import { MongoClient } from 'mongodb';
import { config } from '../../config';
import { logger } from '../../logger';
import type {
  Category,
  CategorySummary,
  DailySummary,
  PasswordResetToken,
  RefreshToken,
  TaskNameStats,
  TaskSuggestion,
  TimeEntry,
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
  TimeEntryExportRow,
  TimeEntryUpdateInput
} from '../provider';
import { SQLITE_SCHEMA_VERSION } from '../sqlite/schema';

type DatabaseCollections = {
  users: User;
  refresh_tokens: RefreshToken;
  password_reset_tokens: PasswordResetToken;
  categories: Category;
  time_entries: TimeEntry;
  user_settings: UserSettings;
  schema_migrations: { version: number; name: string; applied_at: string };
  counters: { _id: string; seq: number };
};

export function createMongoProvider(): DatabaseProvider {
  let client: MongoClient | null = null;
  let dbName = config.mongoDbName;

  const collection = <T extends keyof DatabaseCollections>(name: T) => {
    if (!client) {
      throw new Error('MongoDB client not initialized');
    }
    return client.db(dbName).collection<DatabaseCollections[T]>(name);
  };

  const toIso = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  };

  const nextSequence = async (name: string): Promise<number> => {
    const result = await collection('counters').findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    return result.value?.seq ?? 1;
  };

  const ensureIndexes = async () => {
    await collection('users').createIndex({ email: 1 }, { unique: true });
    await collection('users').createIndex({ username: 1 }, { unique: true });
    await collection('refresh_tokens').createIndex({ token: 1 }, { unique: true });
    await collection('refresh_tokens').createIndex({ user_id: 1 });
    await collection('refresh_tokens').createIndex({ expires_at: 1 });
    await collection('password_reset_tokens').createIndex({ token: 1 }, { unique: true });
    await collection('password_reset_tokens').createIndex({ user_id: 1 });
    await collection('categories').createIndex({ user_id: 1, name: 1 }, { unique: true });
    await collection('categories').createIndex({ user_id: 1 });
    await collection('time_entries').createIndex({ user_id: 1 });
    await collection('time_entries').createIndex({ user_id: 1, start_time: -1 });
    await collection('time_entries').createIndex({ user_id: 1, end_time: 1 });
    await collection('time_entries').createIndex({ user_id: 1, category_id: 1 });
    await collection('time_entries').createIndex({ user_id: 1, task_name: 1 });
    await collection('user_settings').createIndex({ user_id: 1 }, { unique: true });
  };

  return {
    async init() {
      logger.info('Initializing MongoDB', { uri: config.mongoUri, db: config.mongoDbName });
      client = new MongoClient(config.mongoUri);
      await client.connect();
      dbName = config.mongoDbName;
      await ensureIndexes();
      logger.info('MongoDB ready');
    },
    async shutdown() {
      if (client) {
        await client.close();
      }
    },
    async getCurrentVersion() {
      const latest = await collection('schema_migrations')
        .find()
        .sort({ version: -1 })
        .limit(1)
        .toArray();
      return latest.length ? latest[0].version : SQLITE_SCHEMA_VERSION;
    },
    async getLatestVersion() {
      return SQLITE_SCHEMA_VERSION;
    },
    async findUserByEmail(email: string) {
      return collection('users').findOne({ email });
    },
    async findUserById(id: number) {
      return collection('users').findOne({ id });
    },
    async findUserByEmailExcludingId(email: string, excludeId: number) {
      return collection('users').findOne({ email, id: { $ne: excludeId } });
    },
    async createUser(input: { email: string; username: string; password_hash: string }) {
      const id = await nextSequence('users');
      const now = new Date().toISOString();
      const user: User = {
        id,
        email: input.email,
        username: input.username,
        password_hash: input.password_hash,
        created_at: now,
        updated_at: now
      };
      await collection('users').insertOne(user);
      return user;
    },
    async updateUser(id: number, input: { email?: string; username?: string; password_hash?: string }) {
      const now = new Date().toISOString();
      await collection('users').updateOne(
        { id },
        {
          $set: {
            ...(input.email ? { email: input.email } : {}),
            ...(input.username ? { username: input.username } : {}),
            ...(input.password_hash ? { password_hash: input.password_hash } : {}),
            updated_at: now
          }
        }
      );
      const updated = await this.findUserById(id);
      if (!updated) {
        throw new Error('User not found');
      }
      return updated;
    },
    async deleteUser(userId: number) {
      await collection('time_entries').deleteMany({ user_id: userId });
      await collection('categories').deleteMany({ user_id: userId });
      await collection('refresh_tokens').deleteMany({ user_id: userId });
      await collection('users').deleteOne({ id: userId });
    },
    async findAnonymousUserBySession(sessionId: string) {
      return this.findUserByEmail(`anon_${sessionId}@local`);
    },
    async createAnonymousUser(sessionId: string) {
      const shortId = sessionId.substring(0, 8);
      return this.createUser({
        email: `anon_${sessionId}@local`,
        username: `Guest_${shortId}`,
        password_hash: 'anonymous-no-password'
      });
    },
    async createRefreshToken(input: { user_id: number; token: string; expires_at: string }) {
      const id = await nextSequence('refresh_tokens');
      const tokenDoc: RefreshToken = {
        id,
        user_id: input.user_id,
        token: input.token,
        expires_at: input.expires_at,
        created_at: new Date().toISOString()
      };
      await collection('refresh_tokens').insertOne(tokenDoc);
      return tokenDoc;
    },
    async findRefreshToken(token: string) {
      return collection('refresh_tokens').findOne({ token });
    },
    async deleteRefreshTokenById(id: number) {
      await collection('refresh_tokens').deleteOne({ id });
    },
    async deleteRefreshToken(token: string) {
      await collection('refresh_tokens').deleteOne({ token });
    },
    async deleteRefreshTokensForUser(userId: number) {
      await collection('refresh_tokens').deleteMany({ user_id: userId });
    },
    async upsertPasswordResetToken(input: { user_id: number; token: string; expires_at: string }) {
      await collection('password_reset_tokens').deleteMany({ user_id: input.user_id });
      const id = await nextSequence('password_reset_tokens');
      const tokenDoc: PasswordResetToken = {
        id,
        user_id: input.user_id,
        token: input.token,
        expires_at: input.expires_at,
        created_at: new Date().toISOString()
      };
      await collection('password_reset_tokens').insertOne(tokenDoc);
      return tokenDoc;
    },
    async findPasswordResetToken(token: string) {
      return collection('password_reset_tokens').findOne({ token });
    },
    async deletePasswordResetToken(token: string) {
      await collection('password_reset_tokens').deleteOne({ token });
    },
    async deletePasswordResetTokensForUser(userId: number) {
      await collection('password_reset_tokens').deleteMany({ user_id: userId });
    },
    async listCategories(userId: number) {
      return collection('categories')
        .find({ user_id: userId })
        .sort({ name: 1 })
        .toArray();
    },
    async findCategoryById(userId: number, id: number) {
      return collection('categories').findOne({ id, user_id: userId });
    },
    async findCategoryByName(userId: number, name: string) {
      return collection('categories').findOne({ user_id: userId, name });
    },
    async createCategory(input: CategoryCreateInput) {
      const id = await nextSequence('categories');
      const category: Category = {
        id,
        user_id: input.user_id,
        name: input.name,
        color: input.color,
        created_at: new Date().toISOString()
      };
      await collection('categories').insertOne(category);
      return category;
    },
    async updateCategory(userId: number, id: number, input: { name: string; color: string | null }) {
      await collection('categories').updateOne(
        { id, user_id: userId },
        { $set: { name: input.name, color: input.color } }
      );
      const updated = await this.findCategoryById(userId, id);
      if (!updated) {
        throw new Error('Category not found');
      }
      return updated;
    },
    async deleteCategory(userId: number, id: number) {
      await collection('categories').deleteOne({ id, user_id: userId });
    },
    async countCategories(userId: number) {
      return collection('categories').countDocuments({ user_id: userId });
    },
    async listTimeEntries(params: TimeEntriesQueryParams) {
      const match: Record<string, unknown> = { user_id: params.userId };
      if (params.startDate) {
        match.start_time = { ...(match.start_time as Record<string, string>), $gte: params.startDate };
      }
      if (params.endDate) {
        match.start_time = { ...(match.start_time as Record<string, string>), $lte: params.endDate };
      }
      if (params.categoryId) {
        match.category_id = params.categoryId;
      }
      if (params.searchQuery) {
        const categoryMatches = await collection('categories')
          .find({ user_id: params.userId, name: { $regex: params.searchQuery, $options: 'i' } })
          .project({ id: 1 })
          .toArray();
        const categoryIds = categoryMatches.map((cat: Category) => cat.id);
        match.$or = [
          { task_name: { $regex: params.searchQuery, $options: 'i' } },
          ...(categoryIds.length ? [{ category_id: { $in: categoryIds } }] : [])
        ];
      }

      const entries: TimeEntry[] = await collection('time_entries')
        .find(match)
        .sort({ start_time: -1 })
        .skip(params.offset)
        .limit(params.limit)
        .toArray();

      if (entries.length === 0) return [];

      const categoryIds = [...new Set(entries.map((entry) => entry.category_id))];
      const categories: Category[] = await collection('categories')
        .find({ user_id: params.userId, id: { $in: categoryIds } })
        .toArray();
      const categoryMap = new Map<number, Category>(categories.map((cat) => [cat.id, cat]));

      return entries.map((entry) => {
        const category = categoryMap.get(entry.category_id);
        return {
          ...entry,
          category_name: category?.name || 'Unknown',
          category_color: category?.color || null
        };
      });
    },
    async getActiveTimeEntry(userId: number) {
      const entry = await collection('time_entries').findOne({ user_id: userId, end_time: null });
      if (!entry) return null;
      const category = await collection('categories').findOne({ user_id: userId, id: entry.category_id });
      return {
        ...entry,
        category_name: category?.name || 'Unknown',
        category_color: category?.color || null
      };
    },
    async findTimeEntryById(userId: number, id: number) {
      return collection('time_entries').findOne({ id, user_id: userId });
    },
    async findTimeEntryWithCategoryById(userId: number, id: number) {
      const entry = await collection('time_entries').findOne({ id, user_id: userId });
      if (!entry) return null;
      const category = await collection('categories').findOne({ user_id: userId, id: entry.category_id });
      return {
        ...entry,
        category_name: category?.name || 'Unknown',
        category_color: category?.color || null
      };
    },
    async findActiveTimeEntry(userId: number) {
      return collection('time_entries').findOne({ user_id: userId, end_time: null });
    },
    async createTimeEntry(input: TimeEntryCreateInput) {
      const id = await nextSequence('time_entries');
      const entry: TimeEntry = {
        id,
        user_id: input.user_id,
        category_id: input.category_id,
        task_name: input.task_name,
        start_time: input.start_time,
        end_time: toIso(input.end_time) as string | null,
        scheduled_end_time: toIso(input.scheduled_end_time) as string | null,
        duration_minutes: input.duration_minutes,
        created_at: new Date().toISOString()
      };
      await collection('time_entries').insertOne(entry);
      return entry;
    },
    async updateTimeEntry(userId: number, id: number, input: TimeEntryUpdateInput) {
      await collection('time_entries').updateOne(
        { id, user_id: userId },
        {
          $set: {
            ...(input.category_id !== undefined ? { category_id: input.category_id } : {}),
            ...(input.task_name !== undefined ? { task_name: input.task_name } : {}),
            ...(input.start_time !== undefined ? { start_time: input.start_time } : {}),
            ...(input.end_time !== undefined ? { end_time: input.end_time } : {}),
            ...(input.scheduled_end_time !== undefined ? { scheduled_end_time: input.scheduled_end_time } : {}),
            ...(input.duration_minutes !== undefined ? { duration_minutes: input.duration_minutes } : {})
          }
        }
      );
    },
    async updateTimeEntriesByTaskName(userId: number, oldTaskName: string, updates: { task_name?: string; category_id?: number }) {
      const updateDoc: Record<string, unknown> = {};
      if (updates.task_name !== undefined) updateDoc.task_name = updates.task_name;
      if (updates.category_id !== undefined) updateDoc.category_id = updates.category_id;
      if (Object.keys(updateDoc).length === 0) return 0;
      const result = await collection('time_entries').updateMany(
        { user_id: userId, task_name: oldTaskName },
        { $set: updateDoc }
      );
      return result.modifiedCount;
    },
    async updateTimeEntriesForMerge(userId: number, sourceTaskNames: string[], updates: { task_name: string; category_id?: number }) {
      const updateDoc: Record<string, unknown> = { task_name: updates.task_name };
      if (updates.category_id !== undefined) updateDoc.category_id = updates.category_id;
      const result = await collection('time_entries').updateMany(
        { user_id: userId, task_name: { $in: sourceTaskNames } },
        { $set: updateDoc }
      );
      return result.modifiedCount;
    },
    async updateTimeEntriesForBulkUpdate(userId: number, oldTaskName: string, oldCategoryId: number, updates: { task_name: string; category_id: number }) {
      const result = await collection('time_entries').updateMany(
        { user_id: userId, task_name: oldTaskName, category_id: oldCategoryId },
        { $set: { task_name: updates.task_name, category_id: updates.category_id } }
      );
      return result.modifiedCount;
    },
    async countTimeEntriesByTaskNames(userId: number, taskNames: string[]) {
      if (taskNames.length === 0) return 0;
      return collection('time_entries').countDocuments({
        user_id: userId,
        task_name: { $in: taskNames }
      });
    },
    async countTimeEntriesByTaskNameAndCategory(userId: number, taskName: string, categoryId: number) {
      return collection('time_entries').countDocuments({
        user_id: userId,
        task_name: taskName,
        category_id: categoryId
      });
    },
    async deleteTimeEntry(userId: number, id: number) {
      await collection('time_entries').deleteOne({ user_id: userId, id });
    },
    async deleteTimeEntriesForUser(userId: number) {
      const result = await collection('time_entries').deleteMany({ user_id: userId });
      return result.deletedCount || 0;
    },
    async deleteTimeEntriesByCategory(userId: number, categoryId: number) {
      const result = await collection('time_entries').deleteMany({ user_id: userId, category_id: categoryId });
      return result.deletedCount || 0;
    },
    async deleteCategoriesForUser(userId: number) {
      const result = await collection('categories').deleteMany({ user_id: userId });
      return result.deletedCount || 0;
    },
    async deleteTimeEntriesByDate(userId: number, startOfDay: string, endOfDay: string) {
      const result = await collection('time_entries').deleteMany({
        user_id: userId,
        start_time: { $gte: startOfDay, $lte: endOfDay },
        end_time: { $ne: null }
      });
      return result.deletedCount || 0;
    },
    async reassignTimeEntriesCategory(userId: number, fromCategoryId: number, toCategoryId: number) {
      const result = await collection('time_entries').updateMany(
        { user_id: userId, category_id: fromCategoryId },
        { $set: { category_id: toCategoryId } }
      );
      return result.modifiedCount;
    },
    async countTimeEntriesForCategory(userId: number, categoryId: number) {
      return collection('time_entries').countDocuments({ user_id: userId, category_id: categoryId });
    },
    async listTaskSuggestions(userId: number, categoryId: number | null, query: string, limit: number) {
      const match: Record<string, unknown> = {
        user_id: userId,
        task_name: { $nin: [null, ''] }
      };
      if (categoryId) match.category_id = categoryId;
      if (query) match.task_name = { $regex: query, $options: 'i' };

      const results = await collection('time_entries').aggregate([
        { $match: match },
        {
          $group: {
            _id: { task_name: '$task_name', category_id: '$category_id' },
            count: { $sum: 1 },
            totalMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
            lastUsed: { $max: '$start_time' }
          }
        },
        { $sort: { count: -1, totalMinutes: -1 } },
        { $limit: limit }
      ]).toArray();

      return results.map((row: { _id: { task_name: string; category_id: number }; count: number; totalMinutes: number; lastUsed: string }) => ({
        task_name: row._id.task_name as string,
        categoryId: row._id.category_id as number,
        count: row.count as number,
        totalMinutes: row.totalMinutes as number,
        lastUsed: row.lastUsed as string
      }));
    },
    async listTaskNames(params: TaskNamesQueryParams) {
      const match: Record<string, unknown> = {
        user_id: params.userId,
        start_time: { $gte: params.start, $lt: params.end },
        task_name: { $nin: [null, ''] }
      };
      if (params.searchQuery) {
        match.$or = [
          { task_name: { $regex: params.searchQuery, $options: 'i' } }
        ];
      }

      const categoryMatch: Record<string, unknown> = { user_id: params.userId };
      if (params.categoryFilter) {
        categoryMatch.name = params.categoryFilter;
      }
      const categories: Category[] = await collection('categories').find(categoryMatch).toArray();
      const categoryMap = new Map<number, Category>(categories.map((cat) => [cat.id, cat]));
      if (params.categoryFilter) {
        match.category_id = { $in: categories.map((cat) => cat.id) };
      }

      const grouped = await collection('time_entries').aggregate([
        { $match: match },
        {
          $group: {
            _id: { task_name: '$task_name', category_id: '$category_id' },
            count: { $sum: 1 },
            total_minutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
            last_used: { $max: '$start_time' }
          }
        }
      ]).toArray();

      const taskNames: TaskNameStats[] = grouped.map((row: { _id: { task_name: string; category_id: number }; count: number; total_minutes: number; last_used: string }) => {
        const category = categoryMap.get(row._id.category_id as number);
        return {
          task_name: row._id.task_name as string,
          count: row.count as number,
          total_minutes: row.total_minutes as number,
          last_used: row.last_used as string,
          category_name: category?.name,
          category_color: category?.color ?? null
        };
      });

      const sorted = [...taskNames].sort((a, b) => {
        switch (params.sortBy) {
          case 'alpha':
            return a.task_name.localeCompare(b.task_name);
          case 'count':
            return b.count - a.count || b.total_minutes - a.total_minutes;
          case 'recent':
            return (b.last_used || '').localeCompare(a.last_used || '') || b.total_minutes - a.total_minutes;
          case 'time':
          default:
            return b.total_minutes - a.total_minutes || b.count - a.count;
        }
      });

      const totalCount = sorted.length;
      const startIndex = (params.page - 1) * params.pageSize;
      const paged = sorted.slice(startIndex, startIndex + params.pageSize);

      return { taskNames: paged, totalCount };
    },
    async getCategoryDrilldown(params: CategoryDrilldownParams) {
      const category = await collection('categories').findOne({ user_id: params.userId, name: params.categoryName });
      if (!category) {
        throw new Error('Category not found');
      }

      const match = {
        user_id: params.userId,
        category_id: category.id,
        start_time: { $gte: params.start, $lt: params.end },
        task_name: { $nin: [null, ''] }
      };

      const grouped = await collection('time_entries').aggregate([
        { $match: match },
        {
          $group: {
            _id: '$task_name',
            count: { $sum: 1 },
            total_minutes: { $sum: { $ifNull: ['$duration_minutes', 0] } }
          }
        },
        { $sort: { total_minutes: -1, count: -1 } }
      ]).toArray();

      const totalCount = grouped.length;
      const startIndex = (params.page - 1) * params.pageSize;
      const paged = grouped.slice(startIndex, startIndex + params.pageSize);

      const taskNames: TaskNameStats[] = paged.map((row: { _id: string; count: number; total_minutes: number }) => ({
        task_name: row._id as string,
        count: row.count as number,
        total_minutes: row.total_minutes as number
      }));

      const summaryAgg = await collection('time_entries').aggregate([
        { $match: { user_id: params.userId, category_id: category.id, start_time: { $gte: params.start, $lt: params.end } } },
        {
          $group: {
            _id: null,
            minutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const summary = summaryAgg[0] || { minutes: 0, count: 0 };
      const categorySummary: CategorySummary = {
        name: category.name,
        color: category.color || '#6b7280',
        minutes: summary.minutes as number,
        count: summary.count as number
      };

      return { category: categorySummary, taskNames, totalCount };
    },
    async getAnalyticsSummary(params: AnalyticsQueryParams) {
      const byCategoryAgg = await collection('time_entries').aggregate([
        {
          $match: {
            user_id: params.userId,
            start_time: { $gte: params.start, $lt: params.end }
          }
        },
        {
          $group: {
            _id: '$category_id',
            minutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const categories: Category[] = await collection('categories').find({ user_id: params.userId }).toArray();
      const categoryMap = new Map<number, Category>(categories.map((cat) => [cat.id, cat]));
      const byCategory: CategorySummary[] = categories.map((cat) => {
        const row = byCategoryAgg.find((item: { _id: number; minutes: number; count: number }) => item._id === cat.id);
        return {
          name: cat.name,
          color: cat.color || '#6b7280',
          minutes: (row?.minutes as number) || 0,
          count: (row?.count as number) || 0
        };
      }).sort((a, b) => b.minutes - a.minutes);

      const entries: TimeEntry[] = await collection('time_entries').find({
        user_id: params.userId,
        start_time: { $gte: params.start, $lt: params.end }
      }).toArray();

      const dailyMap: Record<string, DailySummary> = {};
      const dailyByCategory: Record<string, Record<string, number>> = {};
      entries.forEach((entry) => {
        const date = entry.start_time.substring(0, 10);
        if (!dailyMap[date]) {
          dailyMap[date] = { date, minutes: 0, byCategory: {} };
          dailyByCategory[date] = {};
        }
        const minutes = entry.duration_minutes || 0;
        dailyMap[date].minutes += minutes;
        const categoryName = categoryMap.get(entry.category_id)?.name || 'Unknown';
        dailyByCategory[date][categoryName] = (dailyByCategory[date][categoryName] || 0) + minutes;
      });

      const daily: DailySummary[] = Object.values(dailyMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(item => ({
          ...item,
          byCategory: dailyByCategory[item.date] || {}
        }));

      const topTasksAgg = await collection('time_entries').aggregate([
        {
          $match: {
            user_id: params.userId,
            start_time: { $gte: params.start, $lt: params.end },
            task_name: { $nin: [null, ''] }
          }
        },
        {
          $group: {
            _id: '$task_name',
            count: { $sum: 1 },
            total_minutes: { $sum: { $ifNull: ['$duration_minutes', 0] } }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

      const topTasks: TaskNameStats[] = topTasksAgg.map((row: { _id: string; count: number; total_minutes: number }) => ({
        task_name: row._id as string,
        count: row.count as number,
        total_minutes: row.total_minutes as number
      }));

      const prevStart = new Date(params.start);
      const prevEnd = new Date(params.end);
      const periodLength = prevEnd.getTime() - prevStart.getTime();
      const prevStartIso = new Date(prevStart.getTime() - periodLength).toISOString();
      const prevEndIso = params.start;

      const previousAgg = await collection('time_entries').aggregate([
        {
          $match: {
            user_id: params.userId,
            start_time: { $gte: prevStartIso, $lt: prevEndIso }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$duration_minutes', 0] } }
          }
        }
      ]).toArray();

      const previousTotal = previousAgg[0]?.total ? (previousAgg[0].total as number) : 0;

      return { byCategory, daily, topTasks, previousTotal };
    },
    async listExportRows(userId: number) {
      const entries: TimeEntry[] = await collection('time_entries')
        .find({ user_id: userId })
        .sort({ start_time: -1 })
        .toArray();
      if (entries.length === 0) return [];
      const categories: Category[] = await collection('categories')
        .find({ user_id: userId })
        .toArray();
      const categoryMap = new Map<number, Category>(categories.map((cat) => [cat.id, cat]));
      return entries.map((entry) => {
        const category = categoryMap.get(entry.category_id);
        return {
          category_name: category?.name || 'Unknown',
          category_color: category?.color || null,
          task_name: entry.task_name,
          start_time: entry.start_time,
          end_time: entry.end_time
        } as TimeEntryExportRow;
      });
    },
    async getUserSettings(userId: number) {
      return collection('user_settings').findOne({ user_id: userId });
    },
    async upsertUserSettings(userId: number, timezone: string) {
      const now = new Date().toISOString();
      await collection('user_settings').updateOne(
        { user_id: userId },
        {
          $set: { timezone, updated_at: now },
          $setOnInsert: { id: await nextSequence('user_settings'), created_at: now, user_id: userId }
        },
        { upsert: true }
      );
      const settings = await collection('user_settings').findOne({ user_id: userId });
      if (!settings) {
        throw new Error('Failed to update settings');
      }
      return settings;
    },
    async createDefaultCategories(userId: number) {
      const defaults = [
        { name: 'Meetings', color: '#6366f1' },
        { name: 'Deep Work', color: '#10b981' },
        { name: 'Email & Communication', color: '#f59e0b' },
        { name: 'Planning', color: '#8b5cf6' },
        { name: 'Break', color: '#64748b' }
      ];
      for (const cat of defaults) {
        const existing = await collection('categories').findOne({ user_id: userId, name: cat.name });
        if (!existing) {
          await this.createCategory({ user_id: userId, name: cat.name, color: cat.color });
        }
      }
      logger.info('Created default categories', { userId });
    },
    async listUsersForMigration() {
      return [];
    },
    async listCategoriesForMigration(_userId: number) {
      return [];
    },
    async listTimeEntriesForMigration(_userId: number) {
      return [];
    },
    async getUserSettingsForMigration(_userId: number) {
      return null;
    }
  };
}
