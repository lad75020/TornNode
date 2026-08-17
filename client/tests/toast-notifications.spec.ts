import { test, expect, gotoDashboard } from './fixtures.js';

async function publishToast(page, detail) {
  await page.evaluate(async payload => {
    const moduleUrl = new URL('/src/toastBus.js', window.location.href).href;
    const { pushToast, pushOrReplaceToast } = await import(/* @vite-ignore */ moduleUrl);
    if (payload.key) pushOrReplaceToast(payload);
    else pushToast(payload);
  }, detail);
}

test.describe('Dashboard notifications', () => {
  test('replaces keyed progress updates and renders one terminal result', async ({ page }) => {
    await gotoDashboard(page);

    for (let percent = 10; percent <= 100; percent += 10) {
      await publishToast(page, {
        key: 'sync-logs',
        ttl: 30000,
        kind: percent === 100 ? 'success' : 'info',
        title: 'Log synchronization',
        body: `${percent}%`
      });
    }

    const region = page.getByRole('region', { name: /notifications/i });
    await expect(region).toContainText('100%');
    await expect(region.getByText('Log synchronization')).toHaveCount(1);
  });

  test('shows warnings and errors without exposing credential fields', async ({ page }) => {
    await gotoDashboard(page);
    await publishToast(page, {
      key: 'safe-error',
      persistent: true,
      kind: 'error',
      title: 'Synchronization failed',
      body: 'Please retry the operation.',
      raw: {
        message: 'safe diagnostic',
        password: 'do-not-render',
        session: 'do-not-render',
        token: 'do-not-render'
      }
    });

    const region = page.getByRole('region', { name: /notifications/i });
    await expect(region).toContainText('Synchronization failed');
    await expect(region).toContainText('safe diagnostic');
    await expect(region).not.toContainText('do-not-render');
    await expect(region.getByRole('button', { name: /dismiss/i })).toBeVisible();
  });

  test('dismisses persistent notifications and expires transient ones', async ({ page }) => {
    await gotoDashboard(page);
    await publishToast(page, {
      key: 'persistent',
      persistent: true,
      kind: 'warning',
      title: 'Warning',
      body: 'Review this warning.'
    });
    const region = page.getByRole('region', { name: /notifications/i });
    await region.getByRole('button', { name: /dismiss/i }).click();
    await expect(region).toBeEmpty();

    await publishToast(page, { key: 'short', ttl: 1000, kind: 'info', title: 'Short', body: 'Expires' });
    await expect(region).toContainText('Short');
    await page.waitForTimeout(1300);
    await expect(region).not.toContainText('Short');
  });
});
