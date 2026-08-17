import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { toFiniteNumber } from './financeAnalytics.js';
import { bucketChartData, chartBuckets, notifyMinDate, validTimestamp } from './activityChartUtils.js';

export default function TravelDurationGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [showChart, setShowChart] = useState(true); const [granularity, setGranularity] = useState('day'); const { themedOptions, ds } = useChartTheme(darkMode);
  useEffect(() => { let cancelled = false; (async () => { setLoading(true); setError(null); try { const all = await getLogsByLogId(6000); const valid = (Array.isArray(all) ? all : []).filter(row => validTimestamp(row) && (toFiniteNumber(row?.data?.duration) ?? -1) >= 0); if (!cancelled) setRows(valid); } catch { if (!cancelled) { setRows([]); setError('Travel duration is unavailable.'); } } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, [logsUpdated]);
  const buckets = useMemo(() => chartBuckets(rows, { granularity, getTimestamp: row => row.timestamp, getValues: row => [Math.floor((toFiniteNumber(row.data.duration) ?? 0) / 60)] }), [rows, granularity]);
  const data = useMemo(() => bucketChartData(buckets, [{ label: 'Durée (min)', data: buckets.map(b => b.sums[0]) }], dateFrom, dateTo, granularity), [buckets, dateFrom, dateTo, granularity]);
  useEffect(() => { if (granularity === 'day') notifyMinDate(buckets, onMinDate); }, [buckets, granularity, onMinDate]); const values = data.datasets[0]?.data || []; const { cumulative, average } = computeSeries(values);
  return <div className="my-4"><h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(v => !v)}>Travel Time</h5>{loading ? <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: 80 }} /> : error ? <div className="text-muted">{error}</div> : !values.length ? <div className="text-muted">No matching travel logs.</div> : showChart && <div style={{ display: 'flex', gap: 8, height: chartHeight }}><div className="btn-group-vertical" role="group" aria-label="Granularity">{['day', 'week', 'month'].map(value => <button type="button" key={value} className={`btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity(value)}>{value}</button>)}</div><div style={{ flex: 1 }}><Bar data={{ labels: data.labels, datasets: [ds('bar', 0, values, { label: 'Durée (min)' }), ds('line', 1, cumulative, { label: 'Cumul (min)', yAxisID: 'y1' }), ds('line', 2, values.map(() => average), { label: 'Moyenne (min)', borderDash: [5, 4], pointRadius: 0 })] }} options={themedOptions({ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } })} /></div></div>}</div>;
}
