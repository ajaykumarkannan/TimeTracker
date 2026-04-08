import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

/**
 * E2E tests use isolated servers per browser project so parallel
 * runs don't share database state.
 *
 * In CI (or when dist/ exists), tests run against the production build
 * (`node dist/server/index.js`) which starts in ~1s vs ~30s for dev
 * servers. Each project still gets its own port & database for isolation.
 *
 * In CI, tests are sharded by browser via the E2E_SHARD env var so each
 * shard only starts the server(s) it actually needs.
 *
 * Locally without a build, falls back to `npm run dev`.
 *
 * Port layout (production — single process per project):
 *   chromium : 4850
 *   mobile   : 4851
 *   firefox  : 4852
 *   webkit   : 4853
 */

const isCI = !!process.env.CI;
const useProd = isCI || fs.existsSync('./dist/server/index.js');

// When CI sets E2E_SHARD, only start servers & projects for that shard
const shard = process.env.E2E_SHARD as 'chromium' | 'firefox' | 'webkit' | 'mobile' | undefined;

interface ServerCfg { port: number; db: string }

const servers: Record<string, ServerCfg> = {
  chromium: { port: 4850, db: './data/test-chromium.db' },
  mobile:   { port: 4851, db: './data/test-mobile.db' },
  firefox:  { port: 4852, db: './data/test-firefox.db' },
  webkit:   { port: 4853, db: './data/test-webkit.db' },
};

function serverCommand(cfg: ServerCfg): string {
  if (useProd) {
    return `NODE_ENV=production PORT=${cfg.port} DB_PATH=${cfg.db} JWT_SECRET=e2e-test-secret RATE_LIMIT_MAX=500 node dist/server/index.js`;
  }
  const vitePort = cfg.port + 100;
  return `PORT=${cfg.port} VITE_PORT=${vitePort} DB_PATH=${cfg.db} npm run dev`;
}

function baseURL(cfg: ServerCfg): string {
  return useProd
    ? `http://localhost:${cfg.port}`
    : `http://localhost:${cfg.port + 100}`;
}

function webServerEntry(cfg: ServerCfg) {
  return {
    command: serverCommand(cfg),
    url: `http://localhost:${cfg.port}`,
    reuseExistingServer: !isCI,
    timeout: useProd ? 30000 : 120000,
  };
}

// --- Projects -----------------------------------------------------------

const allProjects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], baseURL: baseURL(servers.chromium) },
    testIgnore: /mobile\.spec\.ts/,
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'], baseURL: baseURL(servers.webkit) },
    testIgnore: /mobile\.spec\.ts/,
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'], baseURL: baseURL(servers.firefox) },
    testIgnore: /mobile\.spec\.ts/,
  },
  {
    name: 'mobile-ios',
    use: { ...devices['iPhone 15'], baseURL: baseURL(servers.mobile) },
    testMatch: /mobile\.spec\.ts/,
  },
  {
    name: 'mobile-android',
    use: { ...devices['Pixel 7'], baseURL: baseURL(servers.mobile) },
    testMatch: /mobile\.spec\.ts/,
  },
];

// Map shard name → which projects + servers to run
const shardMap: Record<string, { projects: string[]; servers: string[] }> = {
  chromium: { projects: ['chromium'],                        servers: ['chromium'] },
  firefox:  { projects: ['firefox'],                         servers: ['firefox'] },
  webkit:   { projects: ['webkit'],                          servers: ['webkit'] },
  mobile:   { projects: ['mobile-ios', 'mobile-android'],    servers: ['mobile'] },
};

const activeProjects = shard
  ? allProjects.filter(p => shardMap[shard].projects.includes(p.name))
  : allProjects;

const activeServerKeys = shard
  ? shardMap[shard].servers
  : Object.keys(servers);

const webServers = activeServerKeys.map(k => webServerEntry(servers[k]));

// --- Config -------------------------------------------------------------

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : 4,
  reporter: [['html', { outputFolder: '.test-output/playwright-report' }]],
  outputDir: '.test-output/test-results',
  use: {
    trace: 'on-first-retry',
  },
  projects: activeProjects,
  webServer: webServers,
});
