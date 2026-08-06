// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.PLAYWRIGHT_HTML_REPORT ? 'html' : 'list',
  use: {
    baseURL: process.env.AUTH_TEST_BASE_URL || process.env.EXPO_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.EXPO_SKIP_SERVER || process.env.AUTH_TEST_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: process.env.EXPO_BASE_URL || 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
