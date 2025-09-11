import { test, expect } from '@playwright/test';

test('Can login', async ({ page }) => {
  await page.goto('https://torn.dubertrand.fr/');
  await page.getByRole('textbox', { name: 'Username' }).click();
  await page.getByRole('textbox', { name: 'Username' }).fill('ladparis');
  await page.getByRole('textbox', { name: 'Username' }).press('Tab');
  await page.getByRole('textbox', { name: 'Password' }).fill('11Torn00!!');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveTitle(/Torn City Charts/);
  await page.locator('#showItems').click();
  await expect(page.locator('#item_1')).toBeVisible();
});