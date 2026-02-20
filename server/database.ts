import { config } from './config';
import { logger } from './logger';
import type { DatabaseProvider } from './data/provider';
import { createSqliteProvider } from './data/sqlite/provider';
import { createMongoProvider } from './data/mongo/provider';

let provider: DatabaseProvider | null = null;

export async function initDatabase(): Promise<void> {
  if (provider) {
    return;
  }

  provider = config.dbDriver === 'mongo'
    ? createMongoProvider()
    : createSqliteProvider();

  await provider.init();
  const currentVersion = await provider.getCurrentVersion();
  const latestVersion = await provider.getLatestVersion();
  logger.info(`Database ready (${config.dbDriver})`, { currentVersion, latestVersion });
}

export function getProvider(): DatabaseProvider {
  if (!provider) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return provider;
}

export async function shutdownDatabase(): Promise<void> {
  if (provider) {
    await provider.shutdown();
  }
}
