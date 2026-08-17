import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import { finiteNumber, normalizeStockRows, normalizeTimestamp, safeErrorMessage } from './companyAnalytics.js';

export default function CompanyStockChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400 }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [rows, setRows] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [timestamp, setTimestamp] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [reused, setReused] = useState(false);
  const requestIdRef = useRef(null);
  const sequenceRef = useRef(0);

  useWsMessageBus(wsMessages, { onCompanyStock: response => {
    if (!response || response.requestId !== requestIdRef.current) return;
    if (!response.ok) { setError(safeErrorMessage(response.error)); setStatus('error'); return; }
    const nextRows = normalizeStockRows(response.stock).toSorted((left, right) => (finiteNumber(right.item.sold_worth) ?? -Infinity) - (finiteNumber(left.item.sold_worth) ?? -Infinity));
    setRows(nextRows); setTimestamp(normalizeTimestamp(response.timestamp)); setReused(Boolean(response.reused)); setError(null); setStatus(nextRows.length ? 'ready' : 'empty');
  } });

  const load = () => {
    if (typeof sendWs !== 'function' || (wsRef?.current && wsRef.current.readyState !== 1)) { setError('Company analytics is not connected. Please retry after reconnecting.'); setStatus('error'); return; }
    const requestId = `company-stock-${++sequenceRef.current}`;
    requestIdRef.current = requestId; setStatus('loading'); setError(null);
    try { sendWs(JSON.stringify({ type: 'companyStock', requestId })); } catch (_) { setError('Company analytics could not be loaded. Please retry.'); setStatus('error'); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (rows.length && !rows.some(row => row.name === selectedName)) setSelectedName(rows[0].name); }, [rows, selectedName]);
  const current = rows.find(row => row.name === selectedName)?.item;
  const metrics = useMemo(() => ['in_stock', 'on_order', 'sold_amount'].flatMap(key => { const value = finiteNumber(current?.[key]); return value === null ? [] : [{ key, value }]; }), [current]);
  const options = themedOptions({ responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'minute' }, title: { display: true, text: 'Timestamp' } }, y: { beginAtZero: true, title: { display: true, text: 'Value' } } }, plugins: { legend: { position: 'top' } } });
  return <div style={{ width: '100%', height: chartHeight }}><div className="d-flex align-items-center justify-content-between mb-2" style={{ gap: 8 }}><h6 className="m-0">Company Stock (111803)</h6><div style={{ display: 'flex', gap: 6 }}><select className="form-select form-select-sm" value={selectedName} onChange={event => setSelectedName(event.target.value)} disabled={!rows.length}>{rows.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}</select><button className="btn btn-sm btn-outline-primary" onClick={load} disabled={status === 'loading'}>{status === 'loading' ? 'Loading…' : 'Refresh'}</button></div></div>{reused && status === 'ready' && <div style={{ fontSize: 12, opacity: 0.7 }}>Reused recent snapshot{timestamp ? ` from ${new Date(timestamp).toLocaleString()}` : ''}.</div>}{status === 'loading' && <div role="status" style={{ fontSize: 12 }}>Loading snapshot…</div>}{error && <div role="alert" className="alert alert-danger py-1 px-2" style={{ fontSize: 12 }}>{error}</div>}{status === 'empty' && <div role="status" style={{ fontSize: 12 }}>No company stock is available.</div>}{metrics.length > 0 && timestamp !== null && <Bar data={{ datasets: metrics.map((metric, index) => ds('bar', index, [{ x: timestamp, y: metric.value }], { label: metric.key.replace('_', ' ') })) }} options={options} />}</div>;
}
