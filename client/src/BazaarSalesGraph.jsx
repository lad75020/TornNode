import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import JsonPreview from './JsonPreview.jsx';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { openDB } from 'idb';

import { Bar } from 'react-chartjs-2';
// InlineStat removed; stats shown via lines

export default function BazaarSalesGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [totalSum, setTotalSum] = useState(null);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const [yScaleType, setYScaleType] = useState('logarithmic'); // 'logarithmic' | 'linear'
  const [modal, setModal] = useState({ open: false, label: null, payload: null });
  // Mapping bucketLabel -> array de logs bruts (pour reconstituer la liste d'items / ventes)
  const [bucketLogs, setBucketLogs] = useState({});
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
  const all = await index.getAll(1226);
  const buckets = {}; // key -> { sum, sortKey }
  const bucketMap = {}; // key -> [raw log entries]

      function getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return { year: tmp.getUTCFullYear(), week };
      }

      for (const obj of all) {
        if (obj.data && typeof obj.data.cost_total === 'number' && typeof obj.timestamp === 'number') {
          const d = new Date(obj.timestamp * 1000);
          let key, sortKey;
          if (granularity === 'day') {
            key = d.toISOString().slice(0,10);
            sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          } else if (granularity === 'week') {
            const { year, week } = getISOWeek(d);
            key = `${year}-W${String(week).padStart(2,'0')}`;
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
          buckets[key].sum += obj.data.cost_total;
          if (!bucketMap[key]) bucketMap[key] = [];
          bucketMap[key].push(obj);
        }
      }

      let labels = [];
      let sums = [];
      const keys = Object.keys(buckets);
      if (keys.length) {
        if (granularity === 'day') {
          const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
          let cursor = new Date(entries[0].sortKey);
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
          let cursor = new Date(entries[0].sortKey);
          const end = new Date(entries[entries.length-1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const label = isoLabelFromDate(cursor);
            labels.push(label);
            sums.push(buckets[label] ? buckets[label].sum : 0);
            cursor.setUTCDate(cursor.getUTCDate()+7);
          }
        } else if (granularity === 'month') {
          const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
          let cursor = new Date(entries[0].sortKey);
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
      setTotalSum(total);
      const { cumulative, average: avg } = computeSeries(sums);
      if (granularity === 'day' && labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
        try { onMinDate(labels[0]); } catch {}
      }
      let datasets = [
        ds('bar', 0, sums, { label: 'Sales', backgroundColor: 'rgba(75, 192, 192, 0.7)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }),
        ds('line', 1, cumulative, { label: 'Cumul', borderColor: 'rgba(255, 159, 64, 0.9)', backgroundColor: 'rgba(255, 159, 64, 0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
        ds('line', 2, sums.map(()=> avg), { label: 'Moyenne', borderColor: 'rgba(153, 102, 255, 0.9)', backgroundColor: 'rgba(153, 102, 255, 0.3)', borderDash: [6,4], pointRadius: 0, tension: 0, fill: false }),
      ];
      const filtered = granularity === 'day' ? filterDatasetsByDate(labels, datasets, dateFrom, dateTo) : { labels, datasets };
      setChartData(filtered);
      setBucketLogs(bucketMap);
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated, granularity]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
  Bazaar sales per {granularity}
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
                <div className="btn-group btn-group-sm" role="group" aria-label="Y axis scale">
                  <button type="button" className={`btn ${yScaleType === 'linear' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setYScaleType('linear')}>Linear Y</button>
                  <button type="button" className={`btn ${yScaleType === 'logarithmic' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setYScaleType('logarithmic')}>Log Y</button>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  data={chartData}
                  options={themedOptions({
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    onClick: (evt, elements, chart) => {
                      if (!elements || !elements.length) return;
                      const el = elements[0];
                      const idx = el.index;
                      const label = chart.data.labels[idx];
                      if (!label) return;
                      const sales = chart.data.datasets[0].data[idx] || 0;
                      const cumul = chart.data.datasets[1].data[idx] || 0;
                      const moyenne = chart.data.datasets[2].data[idx] || 0;
                      const rawLogs = bucketLogs[label] || [];
                      // Construire la liste détaillée des ventes (suppose structure potentielle des logs)
                      const items = rawLogs.map(l => {
                        const d = new Date(l.timestamp * 1000).toISOString();
                        const data = l.data || {};
                        return {
                          timestamp: l.timestamp,
                          iso: d,
                          item: data.item ?? data.item_name ?? null,
                          item_id: data.item_id ?? data.id ?? null,
                          quantity: data.quantity ?? data.qty ?? data.count ?? 1,
                          cost: data.cost ?? null,
                          cost_total: data.cost_total ?? null
                        };
                      });
                      const payload = {
                        bucket: label,
                        granularity,
                        salesSum: sales,
                        cumulativeAtPoint: cumul,
                        averageReference: moyenne,
                        totalSum,
                        entries: items,
                        entriesCount: items.length,
                        percentOfGlobalSales: totalSum ? (sales / totalSum) : 0
                      };
                      setModal({ open: true, label, payload });
                    },
                    plugins: { legend: { display: true }, tooltip: { enabled: true } },
                    scales: {
                      x: { title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) } },
                      y: {
                        title: { display: true, text: 'Total sales' },
                        beginAtZero: yScaleType === 'linear',
                        type: yScaleType,
                        min: yScaleType === 'logarithmic' ? 1 : 0,
                      },
                      y1: { position: 'right', title: { display: true, text: 'Cumul' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                    },
                  })}
                />
              </div>
            </div>
          </>
        )
      )}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2100, display: 'flex', flexDirection: 'column' }} onClick={() => setModal({ open: false, label: null, payload: null })}>
          <div style={{ margin: '40px auto', background: '#fff', color: '#222', padding: '16px 20px', borderRadius: 8, maxWidth: '90%', maxHeight: '80%', overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h6 style={{ margin: 0 }}>Bucket {modal.label}</h6>
              <button className="btn btn-sm btn-secondary" onClick={() => setModal({ open: false, label: null, payload: null })}>Close</button>
            </div>
            <JsonPreview value={modal.payload} style={{ fontSize: 14 }} />
            {modal?.payload?.entries?.length > 400 && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>Large bucket: {modal.payload.entries.length} entries. Use filter above to narrow.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
