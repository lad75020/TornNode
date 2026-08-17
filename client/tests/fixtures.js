import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  storageState: async ({}, use) => {
    // Production authentication remains cookie-based. Tests stub /session only.
    await use();
  }
});

export { expect };

export async function prepareDashboardPage(page) {
  await page.route('**/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true })
    });
  });

  // Keep dashboard browser tests independent from a running WebSocket service.
  await page.addInitScript(() => {
    class TestWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor() {
        this.readyState = TestWebSocket.CLOSED;
        this.url = '';
        this.protocol = '';
      }

      send() {}
      close() {
        this.readyState = TestWebSocket.CLOSED;
      }
    }

    window.WebSocket = TestWebSocket;
  });
}

export async function gotoDashboard(page, path = '/') {
  await prepareDashboardPage(page);
  await page.goto(path);
  await expect(page.locator('.app-root')).toBeVisible();
  await expect(page.getByTestId('analytics-dashboard-shell')).toBeVisible();
}
