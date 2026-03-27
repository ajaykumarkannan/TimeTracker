// Vercel serverless entry point
// Loads the pre-built CommonJS server from dist/ after `npm run build`.
// Uses createRequire to load CJS modules from an ESM context (package.json has "type": "module").
// The TypeScript source in api/index.ts is kept for type-checking and local builds.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { initDatabase } = require('../dist/server/database');
const app = require('../dist/server/app').default;

let dbReady = null;

function ensureDatabase() {
  if (!dbReady) {
    dbReady = initDatabase().catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

export default async function handler(req, res) {
  await ensureDatabase();
  app(req, res);
}
