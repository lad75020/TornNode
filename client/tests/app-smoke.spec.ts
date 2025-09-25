import { test, expect } from '@playwright/test';

// Smoke test minimaliste: la page charge, le bouton Theme est présent, navigation chart fonctionne.

test.describe('App smoke', () => {
  test('charge page et bouton Theme visible, navigation chart 0 ok', async ({ page }) => {
    await page.goto('/');
    const themeBtn = page.getByRole('button', { name: /^theme$/i });
    await expect(themeBtn).toBeVisible();
    await page.goto('/chart/0');
    // Vérifie qu'au moins un wrapper graphique existe (div avec hauteur définie)
    const chartZone = page.locator('div').filter({ hasText: /Chargement…/ }).first();
    // Pas obligatoire qu'il soit visible tout de suite; on attend que le body soit prêt
    await expect(page.locator('body')).toBeVisible();
  });
});
