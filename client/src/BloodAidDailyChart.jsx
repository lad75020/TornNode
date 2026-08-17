import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { getAllLogs } from './dbLayer.js';
import { toFiniteNumber } from './financeAnalytics.js';
import { bucketChartData, chartBuckets, notifyMinDate, validTimestamp } from './activityChartUtils.js';

export default function BloodAidDailyChart({ logsUpdated, darkMode, chartHeight = 380, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [collapsed, setCollapsed] = useState(false); const { themedOptions, ds } = useChartTheme(darkMode);
  useEffect(() => { let cancelled = false; (async () => { setLoading(true); setError(null); try { const all = await getAllLogs(); const valid = (Array.isArray(all) ? all : []).filter(row => validTimestamp(row) && (toFiniteNumber(row?.quantity ?? 1) ?? -1) >= 0).map(row => ({ ...row, title: String(row?.title ?? row?.data?.title ?? '').toLowerCase() })).filter(row => row.title.includes('blood') || row.title.includes('first aid')); if (!cancelled) setRows(valid); } catch { if (!cancelled) { setRows([]); setError('Medical-item activity is unavailable.'); } } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, [logsUpdated]);
  const buckets = useMemo(() => chartBuckets(rows, { getTimestamp: row => row.timestamp, getValues: row => [row.title.includes('blood') ? 1 : 0, row.title.includes('first aid') ? 1 : 0] }), [rows]);
  const data = useMemo(() => bucketChartData(buckets, [{ label: 'Blood', data: buckets.map(b => b.sums[0]) }, { label: 'First Aid Kit', data: buckets.map(b => b.sums[1]) }], dateFrom, dateTo), [buckets, dateFrom, dateTo]);
  useEffect(() => { notifyMinDate(buckets, onMinDate); }, [buckets, onMinDate]);
  const blood = data.datasets[0]?.data || []; const aid = data.datasets[1]?.data || [];
  return <div className="my-4"><h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setCollapsed(v => !v)}>Used Medical Items</h5>{collapsed ? <div className="text-muted">Hidden</div> : loading ? <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: 80 }} /> : error ? <div className="text-muted">{error}</div> : !blood.length && !aid.length ? <div className="text-muted">No matching logs.</div> : <div style={{ height: chartHeight }}><Bar data={{ labels: data.labels, datasets: [ds('bar', 1, blood, { label: 'Blood', yAxisID: 'y' }), ds('bar', 0, aid, { label: 'First Aid Kit', yAxisID: 'y' })] }} options={themedOptions({ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, stacked: true }, x: { stacked: true } } })} /></div>}</div>;
}
