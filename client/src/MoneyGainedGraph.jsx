import { useEffect, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Bar } from 'react-chartjs-2';
import JsonPreview from './JsonPreview.jsx';
import useBarBucketModal from './hooks/useBarBucketModal.js';
import { bucketForDate, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

export default function MoneyGainedGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rawLogs, setRawLogs] = useState([]);
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [granularity, setGranularity] = useState('day');
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLogsByLogId(9015)
      .then(entries => {
        if (cancelled) return;
        const normalized = (Array.isArray(entries) ? entries : [])
          .map(row => {
            const date = toUnixDate(row?.timestamp);
            const amount = toFiniteNumber(row?.data?.money_gained);
            return date && amount !== null ? { ...row, timestamp: row.timestamp, data: { ...row.data, money_gained: amount } } : null;
          })
          .filter(Boolean);
        setRawLogs(normalized);
        setLoading(false);
        if (normalized.length && typeof onMinDate === 'function') {
          try { onMinDate(new Date(normalized[0].timestamp * 1000).toISOString().slice(0, 10)); } catch (_) {}
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRawLogs([]);
        setError('Crime money data could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const bucketState = useBarBucketModal({
    buildBuckets: async () => {
      const buckets = new Map();
      for (const row of rawLogs) {
        const day = new Date(row.timestamp * 1000).toISOString().slice(0, 10);
        if ((dateFrom && day < dateFrom) || (dateTo && day > dateTo)) continue;
        const bucket = bucketForDate(new Date(row.timestamp * 1000), granularity);
        if (!bucket) continue;
        const current = buckets.get(bucket.label) || { label: bucket.label, sortKey: bucket.sortKey, sum: 0, items: [] };
        current.sum += row.data.money_gained;
        current.items.push(row);
        buckets.set(bucket.label, current);
      }
      const entries = [...buckets.values()].sort((left, right) => left.sortKey - right.sortKey);
      return {
        labels: entries.map(entry => entry.label),
        sums: entries.map(entry => entry.sum),
        bucketObjects: Object.fromEntries(entries.map(entry => [entry.label, entry.items])),
      };
    },
    buildPayload: (label, items) => ({ bucket: label, count: items.length, items }),
    deps: [rawLogs, granularity, dateFrom, dateTo],
  });

  const { data, loading: aggregateLoading, error: aggregateError, onBarClick, showModal, modalLabel, modalItems, payload, closeModal } = bucketState;
  const filteredSeries = computeSeries(data.sums);
  const hasData = data.labels.length > 0;
  const displayError = error || (aggregateError ? 'Crime money data could not be loaded.' : null);

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Crime Money per {granularity}</h5>
      {(loading || aggregateLoading) ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : displayError || !hasData ? (
        <div role="status">{displayError || 'No crime money data available for this range.'}</div>
      ) : showChart ? (
        <div style={{ display: 'flex', gap: 8, height: chartHeight }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="btn-group-vertical" role="group" aria-label="Granularity">
              {['day', 'week', 'month'].map(value => (
                <button key={value} type="button" className={`btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity(value)}>{value === 'day' ? 'Daily' : value === 'week' ? 'Weekly' : 'Monthly'}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <Bar data={{ labels: data.labels, datasets: [
              ds('bar', 0, data.sums, { label: 'Sum', backgroundColor: 'rgba(75,192,192,0.6)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1 }),
              ds('line', 1, filteredSeries.cumulative, { label: 'Cumulative', borderColor: 'rgba(153,102,255,0.9)', backgroundColor: 'rgba(153,102,255,0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
            ] }} options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              onClick: (event, elements, chart) => onBarClick(event, elements, chart),
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { callbacks: { label: context => `${context.dataset.label || ''}: ${context.parsed.y?.toLocaleString?.() ?? context.parsed.y}` } } },
              scales: { x: { title: { display: true, text: granularity } }, y: { title: { display: true, text: 'Gained' }, beginAtZero: true }, y1: { position: 'right', title: { display: true, text: 'Cumulative' }, beginAtZero: true, grid: { drawOnChartArea: false } } },
            })} />
          </div>
        </div>
      ) : null}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', flexDirection: 'column' }} onClick={closeModal}>
          <div style={{ margin: '40px auto', background: '#fff', color: '#222', padding: '16px 20px', borderRadius: 8, maxWidth: '90%', maxHeight: '80%', overflow: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h6 style={{ margin: 0 }}>Bucket {modalLabel} – {modalItems.length} entr{modalItems.length > 1 ? 'ies' : 'y'}</h6>
              <button className="btn btn-sm btn-secondary" onClick={closeModal}>Close</button>
            </div>
            <JsonPreview value={payload} className="json-preview" style={{ fontSize: 14 }} />
          </div>
        </div>
      )}
    </div>
  );
}
