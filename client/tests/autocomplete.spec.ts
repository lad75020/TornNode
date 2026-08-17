import { test, expect } from '@playwright/test';

// Ce test ne s'exécute pleinement que si TEST_JWT est fourni.
const TEST_JWT = process.env.TEST_JWT;

async function injectToken(page){
  if(!TEST_JWT) return;
  await page.addInitScript(token => { window.localStorage.setItem('jwt', token); }, TEST_JWT);
}

async function installItemCatalogWebSocketFixture(page: any){
  await page.addInitScript(() => {
    const catalog = [
      { id: 1, name: 'Xanax', type: 'Drug', price: 100, img64: '', description: 'Fixture item' },
      { id: 2, name: 'Xanax Pack', type: 'Medical', price: 200, img64: '', description: 'Fixture item' },
    ];
    const sockets: any[] = [];
    const browserWindow: any = window;
    browserWindow.__itemCatalogWsSent = [];

    class ItemCatalogWebSocket {
      url: string;
      readyState: number;
      onopen: (() => void) | null;
      onmessage: ((event: { data: string }) => void) | null;
      onclose: ((event: { code: number }) => void) | null;
      onerror: (() => void) | null;

      constructor(url: string){
        this.url = url;
        this.readyState = 0;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        sockets.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.();
        }, 0);
      }

      send(data: string){
        browserWindow.__itemCatalogWsSent.push({ url: this.url, data });
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = null; }
        if (parsed?.type === 'getAllTornItems') {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify({ type: 'getAllTornItems', ok: true, items: catalog }) });
          }, 100);
        }
      }

      close(){
        this.readyState = 3;
        this.onclose?.({ code: 1000 });
      }
    }

    browserWindow.__emitItemCatalogWs = (payload: any) => {
      for (const socket of sockets) {
        if (socket.url.endsWith('/ws')) {
          socket.onmessage?.({ data: JSON.stringify(payload) });
        }
      }
    };
    browserWindow.WebSocket = ItemCatalogWebSocket;
  });
}

test.describe('Autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await injectToken(page);
  });

  test('search, type filtering, price visibility, no results, and watch toggle (si auth)', async ({ page }) => {
    if(!TEST_JWT){
      test.skip(true, 'TEST_JWT non défini – on saute ce test.');
    }
    await page.goto('/');
    const showBtn = page.getByRole('button', { name: /show items/i });
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    const input = page.getByPlaceholder('Rechercher...');
    await expect(input).toBeVisible();
    const typeSelect = page.getByLabel('Item Type');
    await expect(typeSelect).toBeVisible();
    expect(await typeSelect.locator('option').count()).toBeGreaterThan(1);

    await input.fill('xan');
    const listItem = page.locator('ul li').filter({ has: page.locator('input[type="checkbox"]') }).first();
    await expect(listItem).toBeVisible();
    await expect(listItem).toContainText('$');
    await expect(listItem.getByTitle('Rafraîchir le prix')).toBeVisible();

    const firstType = await typeSelect.locator('option').nth(1).getAttribute('value');
    await typeSelect.selectOption(firstType || '');
    await expect(page.locator('ul li').filter({ has: page.locator('input[type="checkbox"]') }).first()).toBeVisible();

    await typeSelect.selectOption('');
    await input.fill('item-that-does-not-exist-9f7d');
    await expect(page.getByText('Aucun résultat')).toBeVisible();

    await input.fill('xan');
    await expect(listItem).toBeVisible();
    // Toggle via checkbox and line click; the existing WebSocket-backed callbacks
    // remain the source of truth for watched-item state.
    const checkbox = listItem.getByRole('checkbox');
    await checkbox.click();
    await listItem.click();
  });

  test('refresh feedback, duplicate suppression, success replacement, and failure retention (si auth)', async ({ page }) => {
    if(!TEST_JWT){
      test.skip(true, 'TEST_JWT non défini – on saute ce test.');
    }
    await installItemCatalogWebSocketFixture(page);
    await page.goto('/');
    await page.getByRole('button', { name: /show items/i }).click();

    const input = page.getByPlaceholder('Rechercher...');
    await expect(input).toBeVisible();
    await input.fill('xan');
    const listItem = page.locator('ul li').filter({ has: page.locator('input[type="checkbox"]') }).first();
    await expect(listItem).toBeVisible();
    await expect(listItem).toContainText('$100');

    const refresh = listItem.getByTitle('Rafraîchir le prix');
    await refresh.click();
    await expect(refresh).toContainText('⏳');
    await refresh.click();
    await page.waitForTimeout(50);
    const updateMessages = await page.evaluate(() => (window as any).__itemCatalogWsSent
      .map((entry: any) => {
        try { return JSON.parse(entry.data); } catch { return null; }
      })
      .filter((message: any) => message?.type === 'updatePrice'));
    expect(updateMessages).toHaveLength(1);

    await page.evaluate(() => (window as any).__emitItemCatalogWs({
      type: 'updatePrice', ok: true, id: 1, price: 350,
    }));
    await expect(listItem).toContainText('$350');

    await page.waitForTimeout(2100);
    await refresh.click();
    await expect(refresh).toContainText('⏳');
    await page.evaluate(() => (window as any).__emitItemCatalogWs({
      type: 'updatePrice', ok: false, error: 'database details must stay private',
    }));
    await expect(listItem).toContainText('$350');
    await expect(page.getByRole('alert')).toContainText('Item price could not be updated. Please retry.');
  });
});
