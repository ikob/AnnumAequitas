import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  globalSetup: './tests/browser/coverage-setup.ts',
  globalTeardown: './tests/browser/coverage-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'], channel: 'chrome', headless: true,
    baseURL: 'http://127.0.0.1:4178',
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm start -- --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178', reuseExistingServer: false,
  },
});
