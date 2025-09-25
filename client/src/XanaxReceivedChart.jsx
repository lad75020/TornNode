import { useEffect, useState, useMemo } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { openDB } from 'idb';

import { Bar } from 'react-chartjs-2';
// InlineStat removed; stats shown via chart lines
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function XanaxReceivedChart({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [totalQty, setTotalQty] = useState(null);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) {
        setLoading(false);
        return;
      }
      const index = db.transaction(storeName).store.index('log');
      const all = await index.getAll(4103);
  const buckets = {}; // key -> { sum, sortKey }
  const cutoffStartMs = Date.UTC(2024, 7, 1); // 2024-08-01 UTC

      function getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return { year: tmp.getUTCFullYear(), week };
      }

  for (const obj of all) {
        if (
          obj.data &&
          Array.isArray(obj.data.items) &&
          obj.data.items[0] &&
          obj.data.items[0].id === 206 &&
          typeof obj.data.items[0].qty === 'number' &&
          typeof obj.timestamp === 'number'
        ) {
          const d = new Date(obj.timestamp * 1000);
      if (d.getTime() < cutoffStartMs) continue; // exclude before cutoff
      const day = d.toISOString().slice(0,10);
      if (dateFrom && day < dateFrom) continue;
      if (dateTo && day > dateTo) continue;
          let key, sortKey;
          if (granularity === 'day') {
            key = d.toISOString().slice(0,10);
            sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          } else if (granularity === 'week') {
            const { year, week } = getISOWeek(d);
            key = `${year}-W${String(week).padStart(2,'0')}`;
            // Start Monday of that ISO week
            const simple = new Date(Date.UTC(year, 0, 4));
            const dayOfWeek = simple.getUTCDay() || 7;
            const week1Monday = new Date(simple);
            week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
            const weekStart = new Date(week1Monday);
            weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
            sortKey = weekStart.getTime();
          } else if (granularity === 'month') {
            const year = d.getUTCFullYear();
            const month = d.getUTCMonth();
            key = `${year}-${String(month+1).padStart(2,'0')}`;
            sortKey = Date.UTC(year, month, 1);
          }
          if (!buckets[key]) buckets[key] = { sum: 0, sortKey };
          buckets[key].sum += obj.data.items[0].qty;
        }
      }

      // Fill gaps with zeroes
      let labels = [];
      let sums = [];
      const keys = Object.keys(buckets);
      if (keys.length) {
        if (granularity === 'day') {
          const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
          // start at cutoff regardless of first entry
          let cursor = new Date(cutoffStartMs);
          const end = new Date(entries[entries.length-1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const k = cursor.toISOString().slice(0,10);
            labels.push(k);
            sums.push(buckets[k] ? buckets[k].sum : 0);
            cursor.setUTCDate(cursor.getUTCDate()+1);
          }
        } else if (granularity === 'week') {
          function isoLabelFromDate(monday) {
            const { year, week } = getISOWeek(monday);
            return `${year}-W${String(week).padStart(2,'0')}`;
          }
          const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
          // compute Monday of cutoff week
          const cutoffDate = new Date(cutoffStartMs);
          const day = cutoffDate.getUTCDay() || 7;
          const cutoffMonday = new Date(cutoffDate);
          cutoffMonday.setUTCDate(cutoffDate.getUTCDate() - (day - 1));
          let cursor = cutoffMonday;
          const end = new Date(entries[entries.length-1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const label = isoLabelFromDate(cursor);
            labels.push(label);
            sums.push(buckets[label] ? buckets[label].sum : 0);
            cursor.setUTCDate(cursor.getUTCDate()+7);
          }
        } else if (granularity === 'month') {
          const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
          let cursor = new Date(Date.UTC(2024,7,1)); // start Aug 2024
          const end = new Date(entries[entries.length-1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`;
            labels.push(label);
            sums.push(buckets[label] ? buckets[label].sum : 0);
            cursor.setUTCMonth(cursor.getUTCMonth()+1);
            cursor.setUTCDate(1);
          }
        }
      }

  const total = sums.reduce((acc,v)=> acc+v, 0);
  setTotalQty(total);
  const { cumulative, average: avg } = computeSeries(sums);

      // Persist earliest day (daily only)
      if (granularity === 'day' && labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
        try { onMinDate(labels[0]); } catch {}
      }
      setChartData({
        labels,
        datasets: [
          ds('bar', 0, sums, { label: 'Xanax', backgroundColor: 'rgba(153, 102, 255, 0.7)', borderColor: 'rgba(153, 102, 255, 1)', borderWidth: 1 }),
          ds('line', 1, cumulative, { label: 'Cumul', borderColor: 'rgba(255, 159, 64, 0.9)', backgroundColor: 'rgba(255, 159, 64, 0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
          ds('line', 2, sums.map(()=> avg), { label: 'Moyenne', borderColor: 'rgba(54, 162, 235, 0.9)', backgroundColor: 'rgba(54, 162, 235, 0.3)', borderDash: [6,4], pointRadius: 0, tension: 0, fill: false }),
        ],
      });
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated, granularity, dateFrom, dateTo, onMinDate]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
  Xanax reçus par {granularity}
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
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  data={chartData}
                  options={themedOptions({
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: { display: true },
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
                      y: { title: { display: true, text: 'Qty' }, beginAtZero: true },
                      y1: { position: 'right', title: { display: true, text: 'Cumul' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                    },
                  })}
                />
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
