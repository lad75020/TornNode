import { test, expect } from '@playwright/test';

// Ce test ne s'exécute pleinement que si TEST_JWT est fourni.
const TEST_JWT = process.env.TEST_JWT;

async function injectToken(page){
  if(!TEST_JWT) return;
  await page.addInitScript(token => { window.localStorage.setItem('jwt', token); }, TEST_JWT);
}

test.describe('Autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await injectToken(page);
  });

  test('search et toggle watch (si auth)', async ({ page }) => {
    await page.goto('/');
    if(!TEST_JWT){
      test.skip(true, 'TEST_JWT non défini – on saute ce test.');
    }
    const showBtn = page.getByRole('button', { name: /show items/i });
    await expect(showBtn).toBeVisible();
    await showBtn.click();
    const input = page.getByPlaceholder('Rechercher...');
    await input.waitFor({ state: 'visible' });
    await input.fill('xan');
    const listItem = page.locator('ul li').first();
    await listItem.waitFor({ state: 'visible' });
    // toggle via checkbox
    const checkbox = listItem.getByRole('checkbox');
    await checkbox.click();
    // toggle via line click
    await listItem.click();
  });
});
