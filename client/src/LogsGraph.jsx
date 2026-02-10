import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { openDB } from 'idb';

import { Bar } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';

function getLastNDaysRange(days) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, Number(days) || 1) - 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default function LogsGraph({ token, onAuth, logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [data, setData] = useState({ labels: [], counts: [] });
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const [zoom30Days, setZoom30Days] = useState(false);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) { setLoading(false); return; }
      const index = db.transaction(storeName).store.index('log');
      const all = await index.getAll(5410);

      const buckets = {}; // key -> { count, sortKey }

      function addToBucket(key, sortKey) {
        if (!buckets[key]) buckets[key] = { count: 0, sortKey };
        buckets[key].count += 1;
      }

      function getISOWeek(date) {
        // date en UTC
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
        if (granularity === 'day') {
          const key = d.toISOString().slice(0, 10);
            // utiliser min timestamp du jour comme sortKey
          const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          addToBucket(key, sortKey);
        } else if (granularity === 'week') {
          const { year, week } = getISOWeek(d);
          const key = `${year}-W${String(week).padStart(2, '0')}`;
          // Approx: start of ISO week = Thursday-based calculation
          const simple = new Date(Date.UTC(year, 0, 4));
          const dayOfWeek = simple.getUTCDay() || 7;
          const week1Monday = new Date(simple);
          week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
          const weekStart = new Date(week1Monday);
          weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
          const sortKey = weekStart.getTime();
          addToBucket(key, sortKey);
        } else if (granularity === 'month') {
          const year = d.getUTCFullYear();
          const month = d.getUTCMonth();
          const key = `${year}-${String(month + 1).padStart(2, '0')}`;
          const sortKey = Date.UTC(year, month, 1);
          addToBucket(key, sortKey);
        }
      }

      // Remplissage des périodes manquantes à 0
      let labels = [];
      let counts = [];
      if (Object.keys(buckets).length === 0) {
        labels = [];
        counts = [];
      } else if (granularity === 'day') {
        // récupérer min et max sortKey
        const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v }));
        entries.sort((a,b)=> a.sortKey - b.sortKey);
        let current = new Date(entries[0].sortKey); // UTC min day
        const end = new Date(entries[entries.length -1].sortKey);
        while (current.getTime() <= end.getTime()) {
          const key = current.toISOString().slice(0,10);
          labels.push(key);
            counts.push(buckets[key] ? buckets[key].count : 0);
          current.setUTCDate(current.getUTCDate() + 1);
        }
      } else if (granularity === 'week') {
        const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v }));
        entries.sort((a,b)=> a.sortKey - b.sortKey);
        // Start Monday of first week
        let startMonday = new Date(entries[0].sortKey);
        startMonday.setUTCHours(0,0,0,0);
        // End Monday of last week
        const endMonday = new Date(entries[entries.length -1].sortKey);
        function isoLabelFromDate(monday) {
          const { year, week } = getISOWeek(monday);
          return `${year}-W${String(week).padStart(2,'0')}`;
        }
        while (startMonday.getTime() <= endMonday.getTime()) {
          const label = isoLabelFromDate(startMonday);
          labels.push(label);
          counts.push(buckets[label] ? buckets[label].count : 0);
          startMonday.setUTCDate(startMonday.getUTCDate() + 7);
        }
      } else if (granularity === 'month') {
        const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v }));
        entries.sort((a,b)=> a.sortKey - b.sortKey);
        let cursor = new Date(entries[0].sortKey); // first day of first month
        const end = new Date(entries[entries.length -1].sortKey);
        while (cursor.getTime() <= end.getTime()) {
          const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`;
          labels.push(label);
          counts.push(buckets[label] ? buckets[label].count : 0);
          // next month
          cursor.setUTCMonth(cursor.getUTCMonth()+1);
          cursor.setUTCDate(1);
        }
      }
      if (labels.length && granularity === 'day' && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
        try { onMinDate(labels[0]); } catch {}
      }
      setData({ labels, counts });
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated, granularity]);

  // Derived series: cumulative + average line
  const { cumulative, average } = computeSeries(data.counts);
  const last30 = getLastNDaysRange(30);
  const effectiveFrom = zoom30Days ? last30.from : dateFrom;
  const effectiveTo = zoom30Days ? last30.to : dateTo;
  const filtered = (() => {
    const { labels, datasets } = filterDatasetsByDate(
      data.labels,
      [ { label: 'Count', data: data.counts } ],
      effectiveFrom,
      effectiveTo
    );
    return { labels, counts: datasets[0].data };
  })();
  const filteredSeries = computeSeries(filtered.counts);
  const timeframeTotalLogs = filtered.counts.reduce((acc, v) => acc + Number(v || 0), 0);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
  Revives per {granularity}
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <>
            <div style={{ display: 'flex', gap: '8px', height: chartHeight }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="btn-group-vertical" role="group" aria-label="Granularity">
                  <button type="button" className={`btn btn-sm ${granularity === 'day' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('day')}>Daily</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'week' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('week')}>Weekly</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'month' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('month')}>Monthly</button>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${zoom30Days ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => {
                    const next = !zoom30Days;
                    setZoom30Days(next);
                    if (next && granularity !== 'day') setGranularity('day');
                  }}
                >
                  30 days
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  data={{
                    labels: filtered.labels,
                    datasets: [
                      ds('bar', 0, filtered.counts, { label: 'Count', backgroundColor: 'rgba(75,192,192,0.6)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1 }),
                      ds('line', 1, filteredSeries.cumulative, { label: 'Cumul', borderColor: 'rgba(255, 159, 64, 0.9)', backgroundColor: 'rgba(255, 159, 64, 0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
                      ds('line', 2, filtered.counts.map(() => filteredSeries.average), { label: 'Moyenne', borderColor: 'rgba(153, 102, 255, 0.9)', backgroundColor: 'rgba(153, 102, 255, 0.3)', borderDash: [6,4], pointRadius: 0, tension: 0, fill: false }),
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
                            return `${dsLabel}: ${ctx.parsed.y}`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: { title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) } },
                      y: { title: { display: true, text: 'Count' }, beginAtZero: true },
                      y1: { position: 'right', title: { display: true, text: 'Cumul' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                    },
                  })}
                />
              </div>
            </div>
            <InlineStat
              id="logs-graph-timeframe-total"
              label="Total"
              value={timeframeTotalLogs}
              containerStyle={{ margin: '8px 0 0 0', maxWidth: 340 }}
              labelStyle={{ fontSize: 12 }}
              inputStyle={{ fontSize: 13, fontWeight: 600, maxWidth: 120, padding: '2px 8px', height: 30 }}
            />
          </>
        )
      )}
    </div>
  );
}
