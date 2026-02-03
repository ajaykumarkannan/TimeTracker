import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2, // Limit workers to avoid rate limiting
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4848',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { 
        ...devices['iPhone 13'],
        // Override to use Chromium instead of WebKit for CI compatibility
        browserName: 'chromium',
      },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4848',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
