import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import InlineStat from './InlineStat.jsx';
import { getLogsByMultipleIds } from './dbLayer.js';
import { toFiniteNumber } from './financeAnalytics.js';
import { bucketChartData, chartBuckets, notifyMinDate, validTimestamp } from './activityChartUtils.js';

export default function BloodCountGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [showChart, setShowChart] = useState(true); const { themedOptions, ds } = useChartTheme(darkMode);
  useEffect(() => { let cancelled = false; (async () => { setLoading(true); setError(null); try { const sources = await getLogsByMultipleIds([2340, 2100]); const deposit = Array.isArray(sources.get(2340)) ? sources.get(2340).map(row => ({ ...row, direction: 'deposit' })) : []; const withdrawal = Array.isArray(sources.get(2100)) ? sources.get(2100).map(row => ({ ...row, direction: 'withdrawal' })) : []; if (!cancelled) setRows([...deposit, ...withdrawal].filter(validTimestamp)); } catch { if (!cancelled) { setRows([]); setError('Blood transactions are unavailable.'); } } finally { if (!cancelled) setLoading(false); } })(); return () => { cancelled = true; }; }, [logsUpdated]);
  const buckets = useMemo(() => chartBuckets(rows, { getTimestamp: row => row.timestamp, getValues: row => [row.direction === 'deposit' ? 1 : 0, row.direction === 'withdrawal' ? 1 : 0] }), [rows]);
  const data = useMemo(() => bucketChartData(buckets, [{ label: 'Deposit', data: buckets.map(b => b.sums[0]) }, { label: 'Withdrawal', data: buckets.map(b => -b.sums[1]) }], dateFrom, dateTo), [buckets, dateFrom, dateTo]);
  useEffect(() => { notifyMinDate(buckets, onMinDate); }, [buckets, onMinDate]);
  const deposits = data.datasets[0]?.data || []; const withdrawals = data.datasets[1]?.data || []; const totalWithdrawal = withdrawals.reduce((sum, value) => sum + Math.abs(toFiniteNumber(value) ?? 0), 0);
  return <div className="my-4"><h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(v => !v)}>Blood transactions</h5>{loading ? <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: 80 }} /> : error ? <div className="text-muted">{error}</div> : !deposits.length && !withdrawals.length ? <div className="text-muted">No matching blood transactions.</div> : showChart && <><div style={{ height: chartHeight }}><Bar data={{ labels: data.labels, datasets: [ds('bar', 0, deposits, { label: 'Deposit' }), ds('bar', 1, withdrawals, { label: 'Withdrawal' })] }} options={themedOptions({ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } })} /></div><InlineStat id="bloodTotalWithdrawals" label="Total withdrawals:" value={totalWithdrawal} /></>}</div>;
}
