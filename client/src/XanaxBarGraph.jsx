import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import InlineStat from './InlineStat.jsx';
import { getLogsByMultipleIds } from './dbLayer.js';
import { toFiniteNumber } from './financeAnalytics.js';
import { bucketChartData, chartBuckets, notifyMinDate, validTimestamp } from './activityChartUtils.js';
import { computeSeries } from './chartTheme.js';

export default function XanaxBarGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  const [granularity, setGranularity] = useState('daily'); const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  useEffect(() => { let cancelled = false; (async () => {
    setLoading(true); setError(null);
    try { const byLog = await getLogsByMultipleIds([2290, 2291]); const records = [
      ...(Array.isArray(byLog.get(2290)) ? byLog.get(2290).map(row => ({ ...row, kind: 'xanax' })) : []),
      ...(Array.isArray(byLog.get(2291)) ? byLog.get(2291).map(row => ({ ...row, kind: 'overdose' })) : []),
    ].filter(validTimestamp); if (!cancelled) setRows(records); }
    catch { if (!cancelled) { setRows([]); setError('Xanax activity is unavailable.'); } }
    finally { if (!cancelled) setLoading(false); }
  })(); return () => { cancelled = true; }; }, [logsUpdated]);
  const buckets = useMemo(() => chartBuckets(rows, { granularity, getTimestamp: row => row.timestamp, getValues: row => [row.kind === 'xanax' ? 1 : 0, row.kind === 'overdose' ? 1 : 0] }), [rows, granularity]);
  const chartData = useMemo(() => bucketChartData(buckets, [{ label: 'Xanax', data: buckets.map(b => b.sums[0]) }, { label: 'Overdoses', data: buckets.map(b => b.sums[1]) }], dateFrom, dateTo, granularity), [buckets, dateFrom, dateTo, granularity]);
  useEffect(() => { if (granularity === 'daily') notifyMinDate(buckets, onMinDate); }, [buckets, granularity, onMinDate]);
  const xanax = chartData.datasets[0]?.data || []; const overdoses = chartData.datasets[1]?.data || [];
  const { cumulative, average } = computeSeries(xanax);
  const total = [...xanax, ...overdoses].reduce((sum, value) => sum + (toFiniteNumber(value) ?? 0), 0);
  return <div className="my-4"><h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(v => !v)}>Xanax taken ({granularity}) and Overdoses</h5>
    {loading ? <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: 80 }} /> : error ? <div className="text-muted">{error}</div> : !xanax.length && !overdoses.length ? <div className="text-muted">No matching Xanax activity.</div> : showChart && <><div style={{ display: 'flex', gap: 8, height: chartHeight }}><div className="btn-group-vertical" role="group" aria-label="Granularity">{['daily', 'weekly', 'monthly'].map(value => <button type="button" key={value} className={`btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity(value)}>{value}</button>)}</div><div style={{ flex: 1 }}><Bar data={{ labels: chartData.labels, datasets: [ds('bar', 0, xanax, { label: 'Xanax' }), ds('bar', 1, overdoses, { label: 'Overdoses' }), ds('line', 2, xanax.map(() => average), { label: 'Average Xanax', borderDash: [6, 4], pointRadius: 0 }), ds('line', 3, cumulative, { label: 'Cumulative Xanax', yAxisID: 'y2' })] }} options={themedOptions({ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y2: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } })} /></div></div><InlineStat id="xanax-graph-timeframe-total" label="Total:" value={total} /></>}</div>;
}
