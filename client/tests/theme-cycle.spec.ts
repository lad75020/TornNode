import { test, expect, gotoDashboard } from './fixtures.js';

test.describe('Theme cycle', () => {
  test('cycle theme updates localStorage and announces the resolved mode', async ({ page }) => {
    await gotoDashboard(page);
    const themeBtn = page.getByRole('button', { name: /^theme$/i });
    const mode = page.getByTestId('theme-mode');

    await expect(themeBtn).toBeVisible();
    await expect(mode).toContainText(/auto|manual/i);
    await themeBtn.click();
    await themeBtn.click();
    await themeBtn.click();

    const raw = await page.evaluate(() => window.localStorage.getItem('themePreference'));
    expect([null, '"dark"', '"light"']).toContain(raw);
    await expect(mode).toContainText(/auto|manual/i);
  });

  test('restores a deliberate theme after reload', async ({ page }) => {
    await gotoDashboard(page);
    await page.evaluate(() => window.localStorage.setItem('themePreference', JSON.stringify('dark')));
    await page.reload();
    await expect(page.locator('.app-root')).toHaveClass(/dark-mode/);
    await expect(page.getByTestId('theme-mode')).toContainText('Dark (manual)');
  });

  test('falls back to a usable automatic theme when storage and geolocation fail', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          return {
            getItem() { throw new Error('storage unavailable'); },
            setItem() { throw new Error('storage unavailable'); },
            removeItem() { throw new Error('storage unavailable'); }
          };
        }
      });
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        get() {
          return { getCurrentPosition(_success: unknown, error?: (reason?: unknown) => void) { error?.(new Error('geolocation denied')); } };
        }
      });
      void original;
    });
    await gotoDashboard(page);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByTestId('theme-mode')).toContainText(/auto|manual/i);
  });

  test('uses matching chart palettes for light and dark resolved modes', async ({ page }) => {
    await gotoDashboard(page);
    const palettes = await page.evaluate(async () => {
      const moduleUrl = new URL('/src/chartTheme.js', window.location.href).href;
      const { getChartColors } = await import(/* @vite-ignore */ moduleUrl);
      return {
        light: getChartColors(false),
        dark: getChartColors(true)
      };
    });
    expect(palettes.light.text).not.toBe(palettes.dark.text);
    expect(palettes.light.grid).not.toBe(palettes.dark.grid);
    expect(palettes.light.linePalette).not.toEqual(palettes.dark.linePalette);
  });
});
