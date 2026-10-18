import { defineConfig, devices } from '@playwright/test';

// Set PW_CHROMIUM_PATH to reuse a preinstalled Chromium instead of downloading one.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/cle-en-main/',
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173/cle-en-main/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
