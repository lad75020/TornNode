import { test, expect, type BrowserContext, type Page } from '@playwright/test';

test.skip(!process.env.AUTH_TEST_BASE_URL, 'requires an explicitly provisioned isolated authentication server');

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('auth-test-user');
  await page.getByLabel('Passkey').fill('synthetic-passkey');
  await page.getByRole('button', { name: 'Sign in' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

async function expectSessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  const session = cookies.filter((cookie) => cookie.name === 'sid');
  expect(session).toHaveLength(1);
  expect(session[0].httpOnly).toBe(true);
  expect(session[0].sameSite).toBe('Lax');
  // A browser-session cookie has no Max-Age/Expires; Playwright reports expiry -1.
  expect(session[0].expires).toBe(-1);
}

async function expectUnauthenticatedSocket(page: Page) {
  const result = await page.evaluate(() => new Promise<{ frames: string[]; code: number; reason: string }>((resolve) => {
    const frames: string[] = [];
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.addEventListener('message', (event) => frames.push(String(event.data)));
    socket.addEventListener('close', (event) => resolve({ frames, code: event.code, reason: event.reason }));
  }));
  expect(result).toEqual({
    frames: ['{"type":"auth","ok":false,"error":"unauthenticated"}'],
    code: 4401,
    reason: 'unauthenticated'
  });
}

test.describe('authentication and sessions', () => {
  test('keyboard login, pending duplicate prevention, and token-free storage', async ({ page }) => {
    await page.goto('/');
    let requests = 0;
    await page.route('**/authenticate', async (route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.continue();
    });
    await page.getByLabel('Username').fill('auth-test-user');
    await page.getByLabel('Passkey').fill('synthetic-passkey');
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toHaveAccessibleName('Sign in');
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Signing in');
    await submit.click({ force: true }).catch(() => {});
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    expect(requests).toBe(1);
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage.session).toEqual({});
    for (const [key, value] of Object.entries(storage.local)) {
      expect(`${key}:${value}`).not.toMatch(/(?:^|[-_:])(auth|token|jwt|session|sid|passkey)(?:$|[-_:])/i);
      expect(value).not.toMatch(/auth-test-user|synthetic-passkey/i);
    }
  });

  test('generic invalid error is announced and empty fields are blocked', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect(await page.getByLabel('Username').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await page.getByLabel('Username').fill('unknown-user');
    await page.getByLabel('Passkey').fill('wrong-passkey');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid username or passkey');
    await expect(page.getByRole('alert')).not.toContainText(/Mongo|Redis|bcrypt|unknown-user/i);
  });

  test('cookie session survives reload and sockets use credential-free URLs', async ({ page, context }) => {
    const sockets: string[] = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await signIn(page);
    await expectSessionCookie(context);
    expect(await page.evaluate(() => document.cookie)).not.toContain('sid=');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect.poll(() => sockets.filter((url) => /\/wsb?$/.test(new URL(url).pathname)).length).toBeGreaterThan(0);
    for (const url of sockets) expect(new URL(url).search).toBe('');
  });

  test('public market is unauthenticated while private pages redirect', async ({ page, context }) => {
    await page.goto('/public-bazaar');
    await expect(page).toHaveURL(/public-bazaar/);
    expect((await context.cookies()).some((cookie) => cookie.name === 'sid')).toBe(false);
    await expectUnauthenticatedSocket(page);
    await page.goto('/chart/0');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('logout only invalidates its current browser context', async ({ browser }) => {
    const first = await browser.newContext(); const second = await browser.newContext();
    const pageA = await first.newPage(); const pageB = await second.newPage();
    const socketAOpened = pageA.waitForEvent('websocket', {
      predicate: (socket) => new URL(socket.url()).pathname === '/ws'
    });
    await signIn(pageA);
    const socketA = await socketAOpened;
    const socketAClosed = socketA.waitForEvent('close');
    await signIn(pageB);
    await pageA.getByRole('button', { name: 'Logout' }).press('Enter');
    await expect(pageA.getByRole('heading', { name: 'Login' })).toBeVisible();
    await socketAClosed;
    await expectUnauthenticatedSocket(pageA);
    await pageA.goto('/chart/0'); await expect(pageA).toHaveURL(/\/$/);
    await pageB.goto('/chart/0'); await expect(pageB.getByRole('button', { name: 'Logout' })).toBeVisible();
    await first.close(); await second.close();
  });
});
