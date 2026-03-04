import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests use isolated dev servers per browser engine so parallel
 * runs don't share rate limits or database state.
 *
 * Server 1 (chromium): API :4847, Vite :4848
 * Server 2 (mobile):   API :4857, Vite :4858
 * Server 3 (firefox):  API :4867, Vite :4868
 * Server 4 (webkit):   API :4877, Vite :4878
 */

const chromium = { api: 4847, vite: 4848, db: './data/test-chromium.db' };
const mobile   = { api: 4857, vite: 4858, db: './data/test-mobile.db' };
const firefox  = { api: 4867, vite: 4868, db: './data/test-firefox.db' };
const webkit   = { api: 4877, vite: 4878, db: './data/test-webkit.db' };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['html', { outputFolder: '.test-output/playwright-report' }]],
  outputDir: '.test-output/test-results',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${chromium.vite}` },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${webkit.vite}` },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], baseURL: `http://localhost:${firefox.vite}` },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-ios',
      use: { ...devices['iPhone 15'], baseURL: `http://localhost:${mobile.vite}` },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${mobile.vite}` },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `PORT=${chromium.api} VITE_PORT=${chromium.vite} DB_PATH=${chromium.db} npm run dev`,
      url: `http://localhost:${chromium.vite}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: `PORT=${mobile.api} VITE_PORT=${mobile.vite} DB_PATH=${mobile.db} npm run dev`,
      url: `http://localhost:${mobile.vite}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: `PORT=${firefox.api} VITE_PORT=${firefox.vite} DB_PATH=${firefox.db} npm run dev`,
      url: `http://localhost:${firefox.vite}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: `PORT=${webkit.api} VITE_PORT=${webkit.vite} DB_PATH=${webkit.db} npm run dev`,
      url: `http://localhost:${webkit.vite}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
