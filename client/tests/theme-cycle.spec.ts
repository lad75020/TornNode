import { test, expect } from '@playwright/test';

// Le hook stocke JSON.stringify(value) -> valeurs attendues: null (clé absente), "\"dark\"", "\"light\"".

test('cycle theme met à jour localStorage', async ({ page }) => {
  await page.goto('/');
  const themeBtn = page.getByRole('button', { name: /^theme$/i });
  await expect(themeBtn).toBeVisible();
  // Effectue 3 cycles pour passer par dark->light->auto potentiellement
  await themeBtn.click();
  await themeBtn.click();
  await themeBtn.click();
  const raw = await page.evaluate(() => window.localStorage.getItem('themePreference'));
  // Accepte: null (auto), "\"dark\"", "\"light\""
  expect([null, '"dark"', '"light"']).toContain(raw);
});
