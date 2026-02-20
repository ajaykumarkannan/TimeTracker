import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('initDatabase provider selection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses Mongo provider when DB_DRIVER=mongo', async () => {
    vi.doMock('../config', () => ({
      config: { dbDriver: 'mongo' }
    }));
    vi.doMock('../logger', () => ({
      logger: { info: vi.fn() }
    }));

    const mongoProvider = {
      init: vi.fn(),
      shutdown: vi.fn(),
      getCurrentVersion: vi.fn().mockResolvedValue(1),
      getLatestVersion: vi.fn().mockResolvedValue(1)
    };
    const sqliteProvider = {
      init: vi.fn(),
      shutdown: vi.fn(),
      getCurrentVersion: vi.fn().mockResolvedValue(1),
      getLatestVersion: vi.fn().mockResolvedValue(1)
    };

    const createMongoProvider = vi.fn(() => mongoProvider);
    const createSqliteProvider = vi.fn(() => sqliteProvider);

    vi.doMock('../data/mongo/provider', () => ({ createMongoProvider }));
    vi.doMock('../data/sqlite/provider', () => ({ createSqliteProvider }));

    const { initDatabase } = await import('../database');
    await initDatabase();

    expect(createMongoProvider).toHaveBeenCalled();
    expect(createSqliteProvider).not.toHaveBeenCalled();
    expect(mongoProvider.init).toHaveBeenCalled();
  });

  it('uses SQLite provider when DB_DRIVER=sqlite', async () => {
    vi.doMock('../config', () => ({
      config: { dbDriver: 'sqlite' }
    }));
    vi.doMock('../logger', () => ({
      logger: { info: vi.fn() }
    }));

    const mongoProvider = {
      init: vi.fn(),
      shutdown: vi.fn(),
      getCurrentVersion: vi.fn().mockResolvedValue(1),
      getLatestVersion: vi.fn().mockResolvedValue(1)
    };
    const sqliteProvider = {
      init: vi.fn(),
      shutdown: vi.fn(),
      getCurrentVersion: vi.fn().mockResolvedValue(1),
      getLatestVersion: vi.fn().mockResolvedValue(1)
    };

    const createMongoProvider = vi.fn(() => mongoProvider);
    const createSqliteProvider = vi.fn(() => sqliteProvider);

    vi.doMock('../data/mongo/provider', () => ({ createMongoProvider }));
    vi.doMock('../data/sqlite/provider', () => ({ createSqliteProvider }));

    const { initDatabase } = await import('../database');
    await initDatabase();

    expect(createSqliteProvider).toHaveBeenCalled();
    expect(createMongoProvider).not.toHaveBeenCalled();
    expect(sqliteProvider.init).toHaveBeenCalled();
  });
});
