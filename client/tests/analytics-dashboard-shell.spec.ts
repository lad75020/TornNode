import { test, expect, prepareDashboardPage, gotoDashboard } from './fixtures.js';

test.describe('Analytics dashboard shell', () => {
  test('keeps the shell mounted while navigating chart routes', async ({ page }) => {
    await gotoDashboard(page, '/chart/0');

    await expect(page).toHaveURL(/\/chart\/0$/);
    await expect(page.getByRole('button', { name: /next chart/i })).toBeVisible();

    await page.getByRole('button', { name: /next chart/i }).click();
    await expect(page).toHaveURL(/\/chart\/1$/);
    await expect(page.getByTestId('analytics-dashboard-shell')).toBeVisible();

    await page.goto('/chart/999');
    await expect(page).toHaveURL(/\/chart\/27$/);
    await expect(page.getByTestId('analytics-dashboard-shell')).toBeVisible();
  });

  test('shows a recoverable lazy-view error without removing shell controls', async ({ page }) => {
    await prepareDashboardPage(page);
    await page.route('**/src/AttacksStatsGraph.jsx', route => route.abort());
    await page.goto('/chart/0');

    await expect(page.getByRole('alert')).toContainText(/chart could not be loaded/i);
    await expect(page.getByRole('button', { name: /next chart/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /enable chart autoplay/i })).toBeVisible();
  });

  test('rotates through routes and stops when autoplay is disabled', async ({ page }) => {
    await page.clock.install();
    await gotoDashboard(page, '/chart/0');

    const autoplay = page.getByRole('checkbox', { name: /enable chart autoplay/i });
    await autoplay.check();
    await page.clock.fastForward(30000);
    await expect(page).toHaveURL(/\/chart\/1$/);

    await autoplay.uncheck();
    await page.clock.fastForward(60000);
    await expect(page).toHaveURL(/\/chart\/1$/);
  });

  test('does not duplicate Chart.js side-effect initialization on module reload', async ({ page }) => {
    await gotoDashboard(page);
    const result = await page.evaluate(async () => {
      const first = await import('/src/chartSetup.js?test=first');
      const second = await import('/src/chartSetup.js?test=second');
      return { first: first.default, second: second.default };
    });
    expect(result).toEqual({ first: null, second: null });
  });
});
