import type { Db } from 'mongodb';
import { logger } from '../../logger';

interface MongoMigration {
  version: number;
  name: string;
  up: (db: Db) => Promise<void>;
}

const migrations: MongoMigration[] = [
  {
    version: 1,
    name: 'remove_duration_minutes',
    async up(db) {
      const result = await db.collection('time_entries').updateMany(
        { duration_minutes: { $exists: true } },
        { $unset: { duration_minutes: '' } }
      );
      logger.info('Removed duration_minutes from existing documents', { modified: result.modifiedCount });
    }
  },
];

export async function runMongoMigrations(db: Db): Promise<void> {
  const coll = db.collection('mongo_migrations');

  const latest = await coll.find().sort({ version: -1 }).limit(1).toArray();
  const currentVersion = latest.length ? (latest[0].version as number) : 0;

  logger.info(`MongoDB at migration version ${currentVersion}, latest is ${migrations.length}`);

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info(`Running MongoDB migration ${migration.version}: ${migration.name}`);
      try {
        await migration.up(db);
        await coll.insertOne({
          version: migration.version,
          name: migration.name,
          applied_at: new Date().toISOString()
        });
        logger.info(`MongoDB migration ${migration.version} completed`);
      } catch (error) {
        logger.error(`MongoDB migration ${migration.version} failed`, { error });
        throw error;
      }
    }
  }
}
