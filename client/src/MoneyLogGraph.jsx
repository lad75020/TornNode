import { useEffect, useMemo, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Bar } from 'react-chartjs-2';
import { aggregateRows, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

const MIN_TIMESTAMP = Date.UTC(2024, 7, 1) / 1000;

export default function MoneyLogGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]);
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [granularity, setGranularity] = useState('day');
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLogsByLogId(4810)
      .then(entries => {
        if (cancelled) return;
        const normalized = (Array.isArray(entries) ? entries : [])
          .map(row => {
            const date = toUnixDate(row?.timestamp);
            const amount = toFiniteNumber(row?.data?.money ?? row?.money);
            return date && amount !== null && row.timestamp >= MIN_TIMESTAMP && Math.abs(amount) <= 20_000_000
              ? { timestamp: row.timestamp, amount }
              : null;
          })
          .filter(Boolean);
        setRows(normalized);
        setLoading(false);
        if (normalized.length && typeof onMinDate === 'function') {
          try { onMinDate(new Date(normalized[0].timestamp * 1000).toISOString().slice(0, 10)); } catch (_) {}
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError('Money log data could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const displayed = useMemo(() => {
    const inRange = rows.filter(row => {
      const day = new Date(row.timestamp * 1000).toISOString().slice(0, 10);
      return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
    });
    const buckets = aggregateRows(inRange, {
      granularity,
      getTimestamp: row => row.timestamp,
      getValues: row => [row.amount],
    });
    return { labels: buckets.map(bucket => bucket.label), sums: buckets.map(bucket => bucket.sums[0]) };
  }, [rows, granularity, dateFrom, dateTo]);

  const cumulative = computeSeries(displayed.sums).cumulative;
  const hasData = displayed.labels.length > 0;

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Money Received per {granularity}</h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || !hasData ? (
        <div role="status">{error || 'No money log data available for this range.'}</div>
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
            <Bar
              data={{ labels: displayed.labels, datasets: [
                ds('bar', 0, displayed.sums, { label: 'Sum', backgroundColor: 'rgba(54,162,235,0.6)', borderColor: 'rgba(54,162,235,1)', borderWidth: 1 }),
                ds('line', 1, cumulative, { label: 'Cumulative', borderColor: 'rgba(255,159,64,0.9)', backgroundColor: 'rgba(255,159,64,0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
              ] }}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, title: { display: false }, tooltip: { callbacks: { label: context => `${context.dataset.label || ''}: ${context.parsed.y?.toLocaleString?.() ?? context.parsed.y}` } } },
                scales: { x: { title: { display: true, text: granularity } }, y: { title: { display: true, text: 'Amount' }, beginAtZero: true }, y1: { position: 'right', title: { display: true, text: 'Cumulative' }, beginAtZero: true, grid: { drawOnChartArea: false } } },
              })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
