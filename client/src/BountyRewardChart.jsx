import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import useChartTheme from './useChartTheme.js';
import { aggregateRows, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

export default function BountyRewardChart({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
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
    getLogsByLogId(6710)
      .then(entries => {
        if (cancelled) return;
        const normalized = (Array.isArray(entries) ? entries : [])
          .map(row => {
            const date = toUnixDate(row?.timestamp);
            const reward = toFiniteNumber(row?.data?.bounty_reward);
            return date && reward !== null ? { timestamp: row.timestamp, reward } : null;
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
        setError('Bounty reward data could not be loaded.');
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
      getValues: row => [1, row.reward],
    });
    return {
      labels: buckets.map(bucket => bucket.label),
      counts: buckets.map(bucket => bucket.sums[0]),
      rewards: buckets.map(bucket => bucket.sums[1]),
    };
  }, [rows, granularity, dateFrom, dateTo]);

  const rewardSeries = computeSeries(displayed.rewards).cumulative;
  const hasData = displayed.labels.length > 0;

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Bounties per {granularity}</h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || !hasData ? (
        <div role="status">{error || 'No bounty data available for this range.'}</div>
      ) : showChart ? (
        <div>
          <div className="mb-2" style={{ maxWidth: 220 }}>
            <label htmlFor="bounty-log-6710-total" className="form-label mb-1">Valid entries in log 6710</label>
            <input id="bounty-log-6710-total" type="text" className="form-control form-control-sm" value={rows.length.toLocaleString()} readOnly />
          </div>
          <div style={{ display: 'flex', gap: 8, height: chartHeight }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="btn-group-vertical" role="group" aria-label="Granularity">
                {['day', 'week', 'month'].map(value => (
                  <button key={value} type="button" className={`btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity(value)}>{value === 'day' ? 'Daily' : value === 'week' ? 'Weekly' : 'Monthly'}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Bar data={{ labels: displayed.labels, datasets: [
                ds('bar', 0, displayed.counts, { label: 'Entries', yAxisID: 'y', borderWidth: 1 }),
                ds('line', 1, rewardSeries, { label: 'Cumulative bounty_reward', yAxisID: 'y1', fill: false, tension: 0.15, pointRadius: 2 }),
              ] }} options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true }, title: { display: false }, tooltip: { callbacks: { label: context => `${context.dataset.label || ''}: ${context.parsed.y?.toLocaleString?.() ?? context.parsed.y}` } } },
                scales: { x: { title: { display: true, text: granularity } }, y: { title: { display: true, text: 'Count' }, beginAtZero: true }, y1: { position: 'right', title: { display: true, text: 'Cumulative bounty_reward' }, beginAtZero: true, grid: { drawOnChartArea: false } } },
              })} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
