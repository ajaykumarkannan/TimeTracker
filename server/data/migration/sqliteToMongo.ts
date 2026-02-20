import { createSqliteProvider } from '../sqlite/provider';
import { createMongoProvider } from '../mongo/provider';
import type { Category } from '../types';

export async function migrateSqliteToMongo(): Promise<void> {
  const sqliteProvider = createSqliteProvider();
  const mongoProvider = createMongoProvider();

  await sqliteProvider.init();
  await mongoProvider.init();

  const users = await sqliteProvider.listUsersForMigration();
  if (users.length === 0) {
    await sqliteProvider.shutdown();
    await mongoProvider.shutdown();
    return;
  }

  for (const user of users) {
    const existing = await mongoProvider.findUserByEmail(user.email);
    const userRecord = existing ?? (await mongoProvider.createUser({
      email: user.email,
      username: user.username,
      password_hash: user.password_hash
    }));

    const categories = await sqliteProvider.listCategoriesForMigration(user.id);
    const categoryMap = new Map<number, Category>();

    for (const category of categories) {
      const existingCategory = await mongoProvider.findCategoryByName(userRecord.id, category.name);
      const created = existingCategory ?? (await mongoProvider.createCategory({
        user_id: userRecord.id,
        name: category.name,
        color: category.color
      }));
      categoryMap.set(category.id, created);
    }

    const entries = await sqliteProvider.listTimeEntriesForMigration(user.id);
    for (const entry of entries) {
      const mappedCategory = categoryMap.get(entry.category_id);
      if (!mappedCategory) continue;
      await mongoProvider.createTimeEntry({
        user_id: userRecord.id,
        category_id: mappedCategory.id,
        task_name: entry.task_name,
        start_time: entry.start_time,
        end_time: entry.end_time,
        scheduled_end_time: entry.scheduled_end_time,
        duration_minutes: entry.duration_minutes
      });
    }

    const settings = await sqliteProvider.getUserSettingsForMigration(user.id);
    if (settings) {
      await mongoProvider.upsertUserSettings(userRecord.id, settings.timezone);
    }
  }

  await sqliteProvider.shutdown();
  await mongoProvider.shutdown();
}

if (process.env.MIGRATE_SQLITE_TO_MONGO === 'true') {
  migrateSqliteToMongo()
    .then(() => {
      console.log('SQLite → MongoDB migration complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed', error);
      process.exit(1);
    });
}
