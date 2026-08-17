import { test, expect, gotoDashboard } from './fixtures.js';

test.describe('App smoke', () => {
  test('loads the dashboard shell, exposes theme and chart navigation', async ({ page }) => {
    await gotoDashboard(page, '/chart/0');
    await expect(page.getByRole('button', { name: /^theme$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /previous chart/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next chart/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /enable chart autoplay/i })).toBeVisible();
    await expect(page.locator('body')).toBeVisible();
  });

  test('keeps core controls keyboard-operable with visible focus', async ({ page }) => {
    await gotoDashboard(page, '/chart/0');
    await page.getByRole('button', { name: /^theme$/i }).focus();
    await expect(page.getByRole('button', { name: /^theme$/i })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('does not horizontally clip the shell at narrow and wide viewports', async ({ page }) => {
    await gotoDashboard(page, '/chart/0');
    for (const viewport of [{ width: 320, height: 800 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        viewport: window.innerWidth
      }));
      expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
    }
  });
});
