import { useEffect, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import { normalizeStockHistory, safeErrorMessage } from './companyAnalytics.js';

export default function CompanyStockHistoryChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400 }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [series, setSeries] = useState({ totalInStock: [], items: {} });
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [showPrices, setShowPrices] = useState(false);
  const requestRef = useRef({ id: null, from: null, to: null, top: 5 });
  const sequenceRef = useRef(0);

  useWsMessageBus(wsMessages, {
    onCompanyStockHistory: response => {
      if (!response || response.requestId !== requestRef.current.id) return;
      if (!response.ok) {
        setError(safeErrorMessage(response.error));
        setStatus('error');
        return;
      }
      const next = normalizeStockHistory(response.series);
      setSeries(next);
      setMeta(response.meta && typeof response.meta === 'object' ? response.meta : null);
      setError(null);
      setStatus(next.totalInStock.length || Object.keys(next.items).length ? 'ready' : 'empty');
    },
  });

  const loadHistory = (options = {}) => {
    if (typeof sendWs !== 'function' || (wsRef?.current && wsRef.current.readyState !== 1)) {
      setError('Company analytics is not connected. Please retry after reconnecting.');
      setStatus('error');
      return;
    }
    const now = Date.now();
    const from = options.from ?? now - 7 * 24 * 60 * 60 * 1000;
    const to = options.to ?? now;
    const top = options.top ?? requestRef.current.top;
    const requestId = `company-stock-history-${++sequenceRef.current}`;
    requestRef.current = { id: requestId, from, to, top };
    setStatus('loading');
    setError(null);
    try { sendWs(JSON.stringify({ type: 'getCompanyStockHistory', from, to, top, requestId })); } catch (_) {
      setError('Company analytics could not be loaded. Please retry.');
      setStatus('error');
    }
  };

  useEffect(() => { loadHistory(); }, []);

  const datasets = [];
  if (series.totalInStock.length) datasets.push(ds('line', 0, series.totalInStock.map(point => ({ x: point.t, y: point.v })), { label: 'Total In Stock', pointRadius: 2, tension: 0.1, yAxisID: 'y' }));
  let index = datasets.length;
  for (const [name, points] of Object.entries(series.items)) {
    datasets.push(ds('line', index++, points.map(point => ({ x: point.t, y: point.v })), { label: `${name} (stock)`, pointRadius: 0, tension: 0.15, yAxisID: 'y' }));
    const prices = points.filter(point => Number.isFinite(point.p));
    if (showPrices && prices.length) datasets.push(ds('line', index++, prices.map(point => ({ x: point.t, y: point.p })), { label: `${name} (price)`, pointRadius: 0, tension: 0.15, borderDash: [4, 4], yAxisID: 'y1' }));
  }

  const options = themedOptions({ responsive: true, maintainAspectRatio: false, parsing: false, normalized: true, scales: { x: { type: 'time', time: { unit: meta?.from && meta?.to && meta.to - meta.from < 36 * 60 * 60 * 1000 ? 'hour' : 'week', tooltipFormat: 'PPpp' }, ticks: { maxRotation: 0, autoSkip: true }, title: { display: true, text: 'Date' } }, y: { beginAtZero: true, title: { display: true, text: 'Stock Qty' } }, y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Price' }, grid: { drawOnChartArea: false } } }, interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { position: 'top' }, tooltip: { enabled: true } } });
  return <div style={{ width: '100%', height: chartHeight }}>
    <div className="d-flex align-items-center justify-content-between mb-2" style={{ gap: 8 }}><h6 className="m-0">Company Stock History</h6><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-sm btn-outline-secondary" onClick={() => setShowPrices(value => !value)}>{showPrices ? 'Hide Prices' : 'Show Prices'}</button><button className="btn btn-sm btn-outline-info" disabled={status === 'loading'} onClick={() => loadHistory({ from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now() })}>30d</button></div></div>
    {status === 'loading' && <div role="status" style={{ fontSize: 12 }}>Loading history…</div>}
    {error && <div className="alert alert-danger py-1 px-2" role="alert" style={{ fontSize: 12 }}>{error}</div>}
    {status === 'empty' && <div role="status" style={{ fontSize: 12, opacity: 0.7 }}>No history is available for this range.</div>}
    {datasets.length > 0 && <Line data={{ datasets }} options={options} />}
  </div>;
}
