import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Bar } from 'react-chartjs-2';
import JsonPreview from './JsonPreview.jsx';
import useBarBucketModal from './hooks/useBarBucketModal.js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

// Graphique des gains (log 9015, data.money_gained) agrégé par jour / semaine / mois
export default function MoneyGainedGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rawLogs, setRawLogs] = useState([]);
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState('day');
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let all = await getLogsByLogId(9015);
      all = all.filter(o => o && o.data && typeof o.data.money_gained !== 'undefined');
      if (!cancelled) setRawLogs(all);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [logsUpdated]);

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
      const buckets = {};
      const bucketObjects = {};
      function add(key, sortKey, amount, obj) {
        if (!buckets[key]) { buckets[key] = { sum: 0, sortKey }; bucketObjects[key] = []; }
        buckets[key].sum += (Number(amount) || 0);
        bucketObjects[key].push(obj);
      }
      function getISOWeek(date) {
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = tmp.getUTCDay() || 7;
        tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
        return { year: tmp.getUTCFullYear(), week };
      }
      for (const obj of rawLogs) {
        const tsMs = obj.timestamp * 1000;
        const d = new Date(tsMs);
        const amount = obj.data.money_gained;
        if (granularity === 'day') {
          const key = d.toISOString().slice(0, 10);
          const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
          add(key, sortKey, amount, obj);
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
          add(key, sortKey, amount, obj);
        } else {
          const year = d.getUTCFullYear();
          const month = d.getUTCMonth();
          const key = `${year}-${String(month + 1).padStart(2, '0')}`;
          const sortKey = Date.UTC(year, month, 1);
          add(key, sortKey, amount, obj);
        }
      }
      const entries = Object.entries(buckets).map(([k, v]) => ({ k, ...v })).sort((a, b) => a.sortKey - b.sortKey);
      let labels = [], sums = [];
      if (entries.length) {
        if (granularity === 'day') {
          let cursor = new Date(entries[0].sortKey);
          const end = new Date(entries[entries.length - 1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const key = cursor.toISOString().slice(0, 10);
            labels.push(key);
            sums.push(buckets[key] ? buckets[key].sum : 0);
            cursor.setUTCDate(cursor.getUTCDate() + 1);
          }
        } else if (granularity === 'week') {
          function isoLabelFromDate(monday) {
            const { year, week } = getISOWeek(monday);
            return `${year}-W${String(week).padStart(2, '0')}`;
          }
          let cursor = new Date(entries[0].sortKey);
          const end = new Date(entries[entries.length - 1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const label = isoLabelFromDate(cursor);
            labels.push(label);
            sums.push(buckets[label] ? buckets[label].sum : 0);
            cursor.setUTCDate(cursor.getUTCDate() + 7);
          }
        } else {
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
      }
      if (labels.length && granularity === 'day' && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
        try { onMinDate(labels[0]); } catch {}
      }
      return { labels, sums, bucketObjects };
    },
    buildPayload: (label, items) => ({ bucket: label, count: items.length, items }),
    deps: [rawLogs, granularity]
  });

  const { cumulative } = computeSeries(data.sums);
  const filtered = (() => {
    const { labels, datasets } = filterDatasetsByDate(
      data.labels,
      [ { label: 'Sum', data: data.sums } ],
      dateFrom,
      dateTo
    );
    return { labels, sums: datasets[0].data };
  })();
  const filteredSeries = computeSeries(filtered.sums);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(p => !p)}
        title="Click to show/hide chart"
      >
        Crime Money per {granularity}
      </h5>
      {(loading || aggLoading) ? (
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
                  labels: filtered.labels,
                  datasets: [
                    ds('bar', 0, filtered.sums, { label: 'Sum', backgroundColor: 'rgba(75,192,192,0.6)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1 }),
                    ds('line', 1, filteredSeries.cumulative, { label: 'Cumulative', borderColor: 'rgba(153,102,255,0.9)', backgroundColor: 'rgba(153,102,255,0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
                  ],
                }}
                options={themedOptions({
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  onClick: (evt, elements, chart) => onBarClick(evt, elements, chart),
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
                    y: { title: { display: true, text: 'Gained' }, beginAtZero: true },
                    y1: { position: 'right', title: { display: true, text: 'Cumulative' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                  },
                })}
              />
            </div>
          </div>
        )
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
