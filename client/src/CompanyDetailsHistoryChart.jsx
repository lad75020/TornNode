import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import { normalizeMetricSeries, normalizeTimestamp, safeErrorMessage } from './companyAnalytics.js';

export default function CompanyDetailsHistoryChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 360, mapToDatasets }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [series, setSeries] = useState({});
  const [meta, setMeta] = useState(null);
  const [metric, setMetric] = useState('');
  const [details, setDetails] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState('idle');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const historyRequestRef = useRef(null);
  const snapshotRequestRef = useRef(null);
  const sequenceRef = useRef(0);
  useWsMessageBus(wsMessages, {
    onCompanyDetails: response => { if (!response || response.requestId !== snapshotRequestRef.current) return; if (!response.ok) { setError(safeErrorMessage(response.error)); setSnapshotStatus('error'); return; } const value = response.details && typeof response.details === 'object' ? response.details : null; setDetails(value ? { value, timestamp: normalizeTimestamp(response.timestamp), reused: Boolean(response.reused) } : null); setSnapshotStatus(value ? 'ready' : 'empty'); },
    onCompanyDetailsHistory: response => { if (!response || response.requestId !== historyRequestRef.current) return; if (!response.ok) { setError(safeErrorMessage(response.error)); setStatus('error'); return; } const next = normalizeMetricSeries(response.series); setSeries(next); setMeta(response.meta && typeof response.meta === 'object' ? response.meta : null); setMetric(current => current && next[current] ? current : Object.keys(next)[0] || ''); setError(null); setStatus(Object.keys(next).length ? 'ready' : 'empty'); },
  });
  const connected = () => typeof sendWs === 'function' && (!wsRef?.current || wsRef.current.readyState === 1);
  const loadHistory = (range = {}) => { if (!connected()) { setError('Company analytics is not connected. Please retry after reconnecting.'); setStatus('error'); return; } const now = Date.now(); const requestId = `company-details-history-${++sequenceRef.current}`; historyRequestRef.current = requestId; setStatus('loading'); setError(null); try { sendWs(JSON.stringify({ type: 'getCompanyDetailsHistory', from: range.from ?? now - 7 * 24 * 60 * 60 * 1000, to: range.to ?? now, requestId })); } catch (_) { setError('Company analytics could not be loaded. Please retry.'); setStatus('error'); } };
  const loadSnapshot = () => { if (!connected()) { setError('Company analytics is not connected. Please retry after reconnecting.'); setSnapshotStatus('error'); return; } const requestId = `company-details-${++sequenceRef.current}`; snapshotRequestRef.current = requestId; setSnapshotStatus('loading'); setError(null); try { sendWs(JSON.stringify({ type: 'companyDetails', requestId })); } catch (_) { setError('Company analytics could not be loaded. Please retry.'); setSnapshotStatus('error'); } };
  useEffect(() => { loadSnapshot(); loadHistory(); }, []);
  const datasets = useMemo(() => { if (typeof mapToDatasets === 'function') { try { return mapToDatasets(series) || []; } catch (_) { return []; } } const points = series[metric] || []; return points.length ? [ds('line', 0, points.map(point => ({ x: point.t, y: point.v })), { label: metric, pointRadius: 1, tension: 0.15 })] : []; }, [series, metric, mapToDatasets]);
  return <div style={{ width: '100%', height: chartHeight }}><div className="d-flex align-items-center justify-content-between mb-2" style={{ gap: 8 }}><h6 className="m-0">Company Details History</h6><div style={{ display: 'flex', gap: 6 }}><select className="form-select form-select-sm" value={metric} onChange={event => setMetric(event.target.value)} disabled={!Object.keys(series).length}>{Object.keys(series).map(key => <option key={key} value={key}>{key}</option>)}</select><button className="btn btn-sm btn-outline-primary" disabled={status === 'loading'} onClick={() => loadHistory()}>Reload</button><button className="btn btn-sm btn-outline-info" disabled={status === 'loading'} onClick={() => loadHistory({ from: Date.now() - 30 * 24 * 60 * 60 * 1000 })}>30d</button></div></div>{snapshotStatus === 'loading' && <div role="status" style={{ fontSize: 12 }}>Loading current details…</div>}{snapshotStatus === 'empty' && <div role="status" style={{ fontSize: 12 }}>No current company details are available.</div>}{details?.reused && <div style={{ fontSize: 12, opacity: 0.7 }}>Reused current details snapshot{details.timestamp ? ` from ${new Date(details.timestamp).toLocaleString()}` : ''}.</div>}{status === 'loading' && <div role="status" style={{ fontSize: 12 }}>Loading history…</div>}{error && <div className="alert alert-danger py-1 px-2" role="alert" style={{ fontSize: 12 }}>{error}</div>}{status === 'empty' && <div role="status" style={{ fontSize: 12 }}>No company details history is available.</div>}{datasets.length > 0 && <Line data={{ datasets }} options={themedOptions({ responsive: true, maintainAspectRatio: false, parsing: false, normalized: true, scales: { x: { type: 'time', time: { unit: meta?.from && meta?.to && meta.to - meta.from < 36 * 60 * 60 * 1000 ? 'hour' : 'day', tooltipFormat: 'PPpp' } }, y: { beginAtZero: true } } })} />}</div>;
}
