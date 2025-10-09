import { useEffect, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
// IndexedDB access via central cache layer
import { getLogsByLogId } from './dbLayer.js';
import { Bar } from 'react-chartjs-2';

// Graphique des variations d'argent (log 4810) agrégé par jour / semaine / mois
import { filterDatasetsByDate } from './dateFilterUtil.js';
export default function MoneyLogGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [data, setData] = useState({ labels: [], sums: [] });
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      let all = await getLogsByLogId(4810);
      // Filtrer: exclure avant août 2024 et montants > 20,000,000
      const minTs = Date.UTC(2024, 7, 1); // 1 August 2024 (mois 6 car 0-indexé)
      all = all.filter(obj => {
        const tsMs = obj.timestamp * 1000;
        if (tsMs < minTs) return false;
        const amt = obj?.data?.money ?? obj?.money ?? 0;
        if (Math.abs(Number(amt) || 0) > 20_000_000) return false;
        return true;
      });
      const buckets = {}; // key -> { sum, sortKey }

      function addToBucket(key, sortKey, amount) {
        if (!buckets[key]) buckets[key] = { sum: 0, sortKey };
        buckets[key].sum += (Number(amount) || 0);
      }

      function getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return { year: tmp.getUTCFullYear(), week };
      }

      for (const obj of all) {
        const tsMs = obj.timestamp * 1000;
        const d = new Date(tsMs);
        const amount = obj?.data?.money ?? obj?.money ?? 0; // fallback if structure diff
        if (granularity === 'day') {
          const key = d.toISOString().slice(0, 10);
          const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          addToBucket(key, sortKey, amount);
        } else if (granularity === 'week') {
          const { year, week } = getISOWeek(d);
            const key = `${year}-W${String(week).padStart(2, '0')}`;
          const simple = new Date(Date.UTC(year, 0, 4));
          const dayOfWeek = simple.getUTCDay() || 7;
          const week1Monday = new Date(simple);
          week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
          const weekStart = new Date(week1Monday);
          weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
          const sortKey = weekStart.getTime();
          addToBucket(key, sortKey, amount);
        } else if (granularity === 'month') {
          const year = d.getUTCFullYear();
          const month = d.getUTCMonth();
          const key = `${year}-${String(month + 1).padStart(2, '0')}`;
          const sortKey = Date.UTC(year, month, 1);
          addToBucket(key, sortKey, amount);
        }
      }

      // Génération labels + sommes (remplir trous)
      let labels = [];
      let sums = [];
      if (Object.keys(buckets).length === 0) {
        labels = [];
        sums = [];
      } else if (granularity === 'day') {
        const entries = Object.entries(buckets).map(([k, v]) => ({ k, ...v }));
        entries.sort((a, b) => a.sortKey - b.sortKey);
        let current = new Date(entries[0].sortKey);
        const end = new Date(entries[entries.length - 1].sortKey);
        while (current.getTime() <= end.getTime()) {
          const key = current.toISOString().slice(0, 10);
          labels.push(key);
          sums.push(buckets[key] ? buckets[key].sum : 0);
          current.setUTCDate(current.getUTCDate() + 1);
        }
      } else if (granularity === 'week') {
        const entries = Object.entries(buckets).map(([k, v]) => ({ k, ...v }));
        entries.sort((a, b) => a.sortKey - b.sortKey);
        let startMonday = new Date(entries[0].sortKey);
        startMonday.setUTCHours(0, 0, 0, 0);
        const endMonday = new Date(entries[entries.length - 1].sortKey);
        function isoLabelFromDate(monday) {
          const { year, week } = getISOWeek(monday);
          return `${year}-W${String(week).padStart(2, '0')}`;
        }
        while (startMonday.getTime() <= endMonday.getTime()) {
          const label = isoLabelFromDate(startMonday);
          labels.push(label);
          sums.push(buckets[label] ? buckets[label].sum : 0);
          startMonday.setUTCDate(startMonday.getUTCDate() + 7);
        }
      } else if (granularity === 'month') {
        const entries = Object.entries(buckets).map(([k, v]) => ({ k, ...v }));
        entries.sort((a, b) => a.sortKey - b.sortKey);
        let cursor = new Date(entries[0].sortKey);
        const end = new Date(entries[entries.length - 1].sortKey);
        while (cursor.getTime() <= end.getTime()) {
          const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
          labels.push(label);
          sums.push(buckets[label] ? buckets[label].sum : 0);
          cursor.setUTCMonth(cursor.getUTCMonth() + 1);
          cursor.setUTCDate(1);
        }
      }
      if (labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
        try { onMinDate(labels[0]); } catch {}
      }
      setData({ labels, sums });
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated, granularity]);

  // Recalcul lorsque plage change (filtrage côté rendu)
  const displayed = (() => {
    const { labels, datasets } = filterDatasetsByDate(
      data.labels,
      [
        { label: 'Sum', data: data.sums },
      ],
      dateFrom,
      dateTo
    );
    return { labels, sums: datasets[0].data };
  })();

  const { cumulative } = computeSeries(data.sums);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(p => !p)}
        title="Click to show/hide chart"
      >
        Money Received per {granularity}
      </h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : (
        showChart && (
          <div style={{ display: 'flex', gap: 8, height: chartHeight }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="btn-group-vertical" role="group" aria-label="Granularity">
                <button type="button" className={`btn btn-sm ${granularity === 'day' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('day')}>Daily</button>
                <button type="button" className={`btn btn-sm ${granularity === 'week' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('week')}>Weekly</button>
                <button type="button" className={`btn btn-sm ${granularity === 'month' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('month')}>Monthly</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Bar
                data={{
                  labels: displayed.labels,
                  datasets: [
                    ds('bar', 0, displayed.sums, { label: 'Sum', backgroundColor: 'rgba(54,162,235,0.6)', borderColor: 'rgba(54,162,235,1)', borderWidth: 1 }),
                    ds('line', 1, computeSeries(displayed.sums).cumulative, { label: 'Cumulative', borderColor: 'rgba(255,159,64,0.9)', backgroundColor: 'rgba(255,159,64,0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
                  ],
                }}
                options={themedOptions({
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { display: true },
                    title: { display: false },
                    tooltip: {
                      callbacks: {
                        label(ctx) {
                          const dsLabel = ctx.dataset.label || '';
                          return `${dsLabel}: ${ctx.parsed.y?.toLocaleString?.() ?? ctx.parsed.y}`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: { title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) } },
                    y: { title: { display: true, text: 'Amount' }, beginAtZero: true },
                    y1: { position: 'right', title: { display: true, text: 'Cumulative' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                  },
                })}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
