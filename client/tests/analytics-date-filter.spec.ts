import { test, expect, gotoDashboard } from './fixtures.js';

test.describe('Analytics date filtering', () => {
  test('filters inclusive daily labels and keeps datasets aligned', async ({ page }) => {
    await gotoDashboard(page);
    const result = await page.evaluate(async () => {
      const { filterDatasetsByDate } = await import('/src/dateFilterUtil.js');
      return filterDatasetsByDate(
        ['2026-01-01', '2026-01-02', '2026-01-03'],
        [{ label: 'wins', data: [1, 2, 3] }, { label: 'losses', data: [4, 5, 6] }],
        '2026-01-02',
        '2026-01-03'
      );
    });

    expect(result.labels).toEqual(['2026-01-02', '2026-01-03']);
    expect(result.datasets.map(dataset => dataset.data)).toEqual([[2, 3], [5, 6]]);
  });

  test('returns a safe empty aligned result for reversed or out-of-range dates', async ({ page }) => {
    await gotoDashboard(page);
    const result = await page.evaluate(async () => {
      const { filterDatasetsByDate } = await import('/src/dateFilterUtil.js');
      return filterDatasetsByDate(
        ['2026-01-01', '2026-01-02'],
        [{ label: 'wins', data: [1, 2] }],
        '2026-02-01',
        '2026-01-01'
      );
    });

    expect(result).toEqual({ labels: [], datasets: [{ label: 'wins', data: [] }] });
  });

  test('leaves unsupported label formats and absent ranges untouched', async ({ page }) => {
    await gotoDashboard(page);
    const result = await page.evaluate(async () => {
      const { filterDatasetsByDate } = await import('/src/dateFilterUtil.js');
      const datasets = [{ label: 'weekly', data: [10, 20] }];
      return {
        unsupported: filterDatasetsByDate(['2026-W01', '2026-W02'], datasets, '2026-01-02', '2026-01-03'),
        absent: filterDatasetsByDate(['2026-01-01'], datasets, null, null)
      };
    });

    expect(result.unsupported.labels).toEqual(['2026-W01', '2026-W02']);
    expect(result.unsupported.datasets[0].data).toEqual([10, 20]);
    expect(result.absent.labels).toEqual(['2026-01-01']);
  });

  test('exposes per-chart date bounds and rejects future end dates', async ({ page }) => {
    await gotoDashboard(page, '/chart/0');
    const from = page.getByLabel('From date');
    const to = page.getByLabel('To date');
    const today = new Date().toISOString().slice(0, 10);

    await expect(from).toBeVisible();
    await expect(to).toHaveAttribute('max', today);
    await to.fill('2999-01-01');
    await expect(to).toHaveValue(today);
  });
});
