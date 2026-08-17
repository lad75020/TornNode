import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import useChartTheme from './useChartTheme.js';
import { finiteNumber, normalizeMetricSeries, normalizeTimestamp, safeErrorMessage } from './companyAnalytics.js';

const LABELS = { daily_income: 'Daily Income', weekly_income: 'Weekly Income', employees_hired: 'Employees Hired', employees_capacity: 'Employees Capacity', daily_customers: 'Daily Customers', weekly_customers: 'Weekly Customers' };

export default function CompanyProfileChart({ wsRef, sendWs, wsMessages, chartHeight = 360, darkMode }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [snapshot, setSnapshot] = useState(null);
  const [series, setSeries] = useState({});
  const [metric, setMetric] = useState('');
  const [snapshotStatus, setSnapshotStatus] = useState('idle');
  const [historyStatus, setHistoryStatus] = useState('idle');
  const [error, setError] = useState(null);
  const snapshotRequestRef = useRef(null);
  const historyRequestRef = useRef(null);
  const sequenceRef = useRef(0);

  useWsMessageBus(wsMessages, {
    onCompanyProfile: response => {
      if (!response || response.requestId !== snapshotRequestRef.current) return;
      if (!response.ok) { setError(safeErrorMessage(response.error)); setSnapshotStatus('error'); return; }
      const profile = response.profile && typeof response.profile === 'object' ? response.profile : null;
      setSnapshot({ profile, timestamp: normalizeTimestamp(response.timestamp), reused: Boolean(response.reused), stale: Boolean(response.stale) });
      setSnapshotStatus(profile ? 'ready' : 'empty');
    },
    onCompanyProfileHistory: response => {
      if (!response || response.requestId !== historyRequestRef.current) return;
      if (!response.ok) { setError(safeErrorMessage(response.error)); setHistoryStatus('error'); return; }
      const next = normalizeMetricSeries(response.series);
      setSeries(next); setMetric(current => current && next[current] ? current : Object.keys(next)[0] || ''); setHistoryStatus(Object.keys(next).length ? 'ready' : 'empty');
    },
  });
  const connected = () => typeof sendWs === 'function' && (!wsRef?.current || wsRef.current.readyState === 1);
  const requestSnapshot = () => { if (!connected()) { setError('Company analytics is not connected. Please retry after reconnecting.'); setSnapshotStatus('error'); return; } const requestId = `company-profile-${++sequenceRef.current}`; snapshotRequestRef.current = requestId; setSnapshotStatus('loading'); setError(null); try { sendWs(JSON.stringify({ type: 'companyProfile', requestId })); } catch (_) { setError('Company analytics could not be loaded. Please retry.'); setSnapshotStatus('error'); } };
  const requestHistory = () => { if (!connected()) { setError('Company analytics is not connected. Please retry after reconnecting.'); setHistoryStatus('error'); return; } const requestId = `company-profile-history-${++sequenceRef.current}`; historyRequestRef.current = requestId; setHistoryStatus('loading'); setError(null); try { sendWs(JSON.stringify({ type: 'getCompanyProfileHistory', requestId })); } catch (_) { setError('Company analytics could not be loaded. Please retry.'); setHistoryStatus('error'); } };
  useEffect(() => { requestSnapshot(); requestHistory(); }, []);
  const points = series[metric] || [];
  const lineData = useMemo(() => ({ datasets: points.length ? [ds('line', 0, points.map(point => ({ x: point.t, y: point.v })), { label: LABELS[metric] || metric, tension: 0.2, pointRadius: 3 })] : [] }), [points, metric]);
  const details = snapshot?.profile;
  return <div style={{ width: '100%', height: chartHeight, display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}><strong>Company Profile</strong><select value={metric} onChange={event => setMetric(event.target.value)} className="form-select form-select-sm" style={{ width: 210 }} disabled={!Object.keys(series).length}>{Object.keys(series).map(key => <option key={key} value={key}>{LABELS[key] || key}</option>)}</select><button className="btn btn-outline-primary btn-sm" disabled={snapshotStatus === 'loading'} onClick={requestSnapshot}>Refresh</button><button className="btn btn-outline-secondary btn-sm" disabled={historyStatus === 'loading'} onClick={requestHistory}>{historyStatus === 'loading' ? 'Loading…' : 'Reload History'}</button>{snapshot?.reused && <span className="badge bg-secondary">reused snapshot</span>}{snapshot?.stale && <span className="badge bg-warning text-dark">stale fallback</span>}</div>{(snapshotStatus === 'loading' || historyStatus === 'loading') && <div role="status" style={{ fontSize: 12 }}>Loading company profile…</div>}{error && <div className="alert alert-danger py-1 px-2" role="alert" style={{ fontSize: 12 }}>{error}</div>}{historyStatus === 'empty' && <div role="status" style={{ fontSize: 12 }}>No profile history is available.</div>}{lineData.datasets.length > 0 && <div style={{ flex: 1 }}><Line data={lineData} options={themedOptions({ responsive: true, maintainAspectRatio: false, scales: { x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PPpp' } }, y: {} } })} /></div>}{details && <div style={{ marginTop: 8, fontSize: 12 }}>Employees: {finiteNumber(details.employees_hired) ?? '—'}/{finiteNumber(details.employees_capacity) ?? '—'} | Daily Customers: {finiteNumber(details.daily_customers) ?? '—'} | Weekly Customers: {finiteNumber(details.weekly_customers) ?? '—'}</div>}</div>;
}
