import { useState } from 'react';
import JsonPreview from './JsonPreview.jsx';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { getAllItemsFromIDB } from './syncItemsToIndexedDB.js';
import { Bar } from 'react-chartjs-2';
import useBarBucketModal from './hooks/useBarBucketModal.js';

// Refactor : utilisation du hook générique useBarBucketModal pour DRY la logique d'agrégation & modale
export default function ItemsGainedGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(false); // chargement prix + logs
  const [granularity, setGranularity] = useState('day');
  const { themedOptions, ds } = useChartTheme(darkMode);

  const {
    data,
    loading: aggLoading,
    onBarClick,
    showModal,
    modalLabel,
    modalItems,
    payload,
    closeModal
  } = useBarBucketModal({
    buildBuckets: async () => {
      setLoading(true);
      const logs = await getLogsByLogId(9020); // items gained
      const items = await getAllItemsFromIDB();
      const priceMap = new Map();
      for (const it of items) { if (it && typeof it.id !== 'undefined') priceMap.set(Number(it.id), Number(it.price) || 0); }

      function extractIdAmount(entry) {
        if (!entry || typeof entry !== 'object') return null;
        if (typeof entry.id !== 'undefined') {
          const id = Number(entry.id);
          const amount = Number(entry.amount ?? entry.qty ?? entry.quantity ?? entry.count ?? entry.value ?? 0);
          if (!Number.isFinite(id) || !Number.isFinite(amount)) return null; return { id, amount };
        }
        const keys = Object.keys(entry);
        if (keys.length === 1) {
          const k = Number(keys[0]); let v = entry[keys[0]];
            if (v && typeof v === 'object') v = Number(v.amount ?? v.qty ?? v.quantity ?? v.count ?? v.value ?? 0); else v = Number(v);
          if (!Number.isFinite(k) || !Number.isFinite(v)) return null; return { id: k, amount: v };
        }
        return null;
      }

      const buckets = {}; const bucketObjs = {};
      function addToBucket(key, sortKey, value, sourceLog) {
        if (!buckets[key]) { buckets[key] = { sum: 0, sortKey }; bucketObjs[key] = []; }
        buckets[key].sum += value; bucketObjs[key].push(sourceLog);
      }
      function getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return { year: tmp.getUTCFullYear(), week };
      }

      for (const log of logs) {
        if (!log || !log.data || !log.data.items_gained) continue;
        let totalValue = 0; const ig = log.data.items_gained;
        if (Array.isArray(ig)) {
          for (const rawEntry of ig) {
            const pair = extractIdAmount(rawEntry); if (!pair) continue;
            const price = priceMap.get(pair.id); if (price && price > 0) totalValue += price * pair.amount;
          }
        } else if (typeof ig === 'object') {
          for (const k of Object.keys(ig)) {
            const id = Number(k); if (!Number.isFinite(id)) continue;
            let rawVal = ig[k]; let qty = 0;
            if (rawVal && typeof rawVal === 'object') qty = Number(rawVal.amount ?? rawVal.qty ?? rawVal.quantity ?? rawVal.count ?? rawVal.value ?? 0); else qty = Number(rawVal);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            const price = priceMap.get(id); if (price && price > 0) totalValue += price * qty;
          }
        }
        if (totalValue <= 0) continue;
        const tsMs = log.timestamp * 1000; const d = new Date(tsMs);
        const dayStr = d.toISOString().slice(0,10);
        if (dateFrom && dayStr < dateFrom) continue;
        if (dateTo && dayStr > dateTo) continue;
        if (granularity === 'day') {
          const key = d.toISOString().slice(0,10); const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); addToBucket(key, sortKey, totalValue, log);
        } else if (granularity === 'week') {
          const { year, week } = getISOWeek(d); const key = `${year}-W${String(week).padStart(2,'0')}`;
          const simple = new Date(Date.UTC(year,0,4)); const dayOfWeek = simple.getUTCDay() || 7;
          const week1Monday = new Date(simple); week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
          const weekStart = new Date(week1Monday); weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
          const sortKey = weekStart.getTime(); addToBucket(key, sortKey, totalValue, log);
        } else { // month
          const year = d.getUTCFullYear(); const month = d.getUTCMonth(); const key = `${year}-${String(month+1).padStart(2,'0')}`; const sortKey = Date.UTC(year, month, 1); addToBucket(key, sortKey, totalValue, log);
        }
      }

      const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v }));
      if (!entries.length) { setLoading(false); return { labels: [], sums: [], bucketObjects: {} }; }
      entries.sort((a,b) => a.sortKey - b.sortKey);
      let labels = [], sums = [];
      if (granularity === 'day') {
        let cursor = new Date(entries[0].sortKey); const end = new Date(entries[entries.length-1].sortKey);
        while (cursor.getTime() <= end.getTime()) { const key = cursor.toISOString().slice(0,10); labels.push(key); sums.push(buckets[key] ? buckets[key].sum : 0); cursor.setUTCDate(cursor.getUTCDate()+1); }
      } else if (granularity === 'week') {
        function isoLabelFromDate(monday){ const { year, week } = getISOWeek(monday); return `${year}-W${String(week).padStart(2,'0')}`; }
        let cursor = new Date(entries[0].sortKey); const end = new Date(entries[entries.length-1].sortKey);
        while (cursor.getTime() <= end.getTime()) { const label = isoLabelFromDate(cursor); labels.push(label); sums.push(buckets[label] ? buckets[label].sum : 0); cursor.setUTCDate(cursor.getUTCDate()+7); }
      } else { // month
        let cursor = new Date(entries[0].sortKey); const end = new Date(entries[entries.length-1].sortKey);
        while (cursor.getTime() <= end.getTime()) { const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`; labels.push(label); sums.push(buckets[label] ? buckets[label].sum : 0); cursor.setUTCMonth(cursor.getUTCMonth()+1); cursor.setUTCDate(1); }
      }
      if (granularity === 'day' && labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) { try { onMinDate(labels[0]); } catch {} }
      setLoading(false);
      return { labels, sums, bucketObjects: bucketObjs };
    },
    buildPayload: (label, items) => ({ bucket: label, count: items.length, items }),
    deps: [logsUpdated, granularity, dateFrom, dateTo]
  });

  const { cumulative } = computeSeries(data.sums);

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(p => !p)} title="Click to show/hide chart">
        Items Value Gained per {granularity}
      </h5>
      {(loading || aggLoading) ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : showChart && (
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
                labels: data.labels,
                datasets: [
                  ds('bar', 0, data.sums, { label: 'Value Sum', backgroundColor: 'rgba(255,206,86,0.6)', borderColor: 'rgba(255,206,86,1)', borderWidth: 1 }),
                  ds('line', 1, cumulative, { label: 'Cumulative', borderColor: 'rgba(54,162,235,0.9)', backgroundColor: 'rgba(54,162,235,0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false })
                ]
              }}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements, chart) => onBarClick(evt, elements, chart),
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  legend: { display: true },
                  title: { display: false },
                  tooltip: { callbacks: { label(ctx) { const dsLabel = ctx.dataset.label || ''; return `${dsLabel}: ${ctx.parsed.y?.toLocaleString?.() ?? ctx.parsed.y}`; } } }
                },
                scales: {
                  x: { title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) } },
                  y: { title: { display: true, text: 'Value' }, beginAtZero: true },
                  y1: { position: 'right', title: { display: true, text: 'Cumulative' }, beginAtZero: true, grid: { drawOnChartArea: false } }
                }
              })}
            />
          </div>
        </div>
      )}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', flexDirection: 'column' }} onClick={closeModal}>
          <div style={{ margin: '40px auto', background: '#fff', color: '#222', padding: '16px 20px', borderRadius: 8, maxWidth: '90%', maxHeight: '80%', overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h6 style={{ margin: 0 }}>Bucket {modalLabel} – {modalItems.length} entr{modalItems.length>1?'ies':'y'}</h6>
              <button className="btn btn-sm btn-secondary" onClick={closeModal}>Close</button>
            </div>
            <JsonPreview value={payload} className="json-preview" style={{ fontSize: 14 }} />
            {modalItems.length > 300 && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                Displaying all {modalItems.length} items. Consider narrowing date range if performance degrades.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
