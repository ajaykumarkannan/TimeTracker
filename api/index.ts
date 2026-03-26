import { initDatabase } from '../server/database';
import app from '../server/app';

// Initialize database once — reused across warm invocations
let dbReady: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  if (!dbReady) {
    dbReady = initDatabase().catch((err) => {
      dbReady = null; // Allow retry on next invocation
      throw err;
    });
  }
  return dbReady;
}

// Serverless handler: ensure DB is ready, then delegate to Express
export default async function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  await ensureDatabase();
  app(req, res);
}
