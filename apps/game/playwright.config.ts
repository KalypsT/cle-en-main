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
    // The reference phone screen of the mock-ups (docs/maquettes).
    viewport: { width: 390, height: 844 },
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    // CI builds in an earlier step; locally, build before serving.
    command: process.env.CI ? 'pnpm preview' : 'pnpm build && pnpm preview',
    url: 'http://localhost:4173/cle-en-main/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
