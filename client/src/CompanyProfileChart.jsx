import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import useChartTheme from './useChartTheme.js';

/* CompanyProfileChart (copie alignée sur version Expo, placée ici pour build Vite principal)
   Affiche métriques snapshot + historique local minimal. */
export default function CompanyProfileChart({ sendWs, wsMessages, chartHeight = 360, darkMode }) {
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [series, setSeries] = useState(null); // backend historical series
  const [loadingHistory, setLoadingHistory] = useState(false);
  const lastTsRef = useRef(null);
  const [metric, setMetric] = useState('daily_income');
  const { themedOptions, ds } = useChartTheme(darkMode);
  // (Logs debug supprimés pour production)
  useEffect(() => {
    try { sendWs && sendWs({ type:'companyProfile' }); } catch {}
    try { setLoadingHistory(true); sendWs && sendWs({ type:'getCompanyProfileHistory' }); } catch { setLoadingHistory(false); }
  }, []);

  useWsMessageBus(wsMessages, {
    onCompanyProfile: (lastObj) => {
      if (!lastObj || lastObj.ok === false) return;
      setSnapshot(lastObj);
      const tsNum = Number(lastObj.timestamp);
      if (tsNum && lastObj.profile && tsNum !== lastTsRef.current) {
        lastTsRef.current = tsNum;
        setHistory(h => [...h, { t: tsNum, profile: lastObj.profile }]);
      }
    },
    onCompanyProfileHistory: (parsed) => {
      setLoadingHistory(false);
      if (parsed.ok && parsed.series) setSeries(parsed.series);
    }
  });

  // Capture historique complet depuis backend
  useEffect(() => {
    if (!Array.isArray(wsMessages) || wsMessages.length === 0) return;
    const slice = wsMessages.slice(-50);
    for (let i = slice.length - 1; i >= 0; i--) {
      const raw = slice[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed) continue;
      if (parsed.type === 'getCompanyProfileHistory') {
        setLoadingHistory(false);
        if (parsed.ok && parsed.series) {
          setSeries(parsed.series);
        }
        break;
      }
    }
  }, [wsMessages]);

  const metricsDefs = [
    { key:'daily_income', label:'Daily Income' },
    { key:'weekly_income', label:'Weekly Income' },
    { key:'employees_hired', label:'Employees Hired' },
    { key:'employees_capacity', label:'Employees Capacity' },
    { key:'daily_customers', label:'Daily Customers' },
    { key:'weekly_customers', label:'Weekly Customers' }
  ];

  // Garde: au premier render snapshot est null → accéder snapshot.profile provoquait une erreur et empêchait tout rendu.
  // On sécurise avec optional chaining.
  const profile = snapshot?.profile || null;

  function safeNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  const lineData = useMemo(() => {
    // Use backend series when available; fallback to local session history
    let points;
    if (series && series[metric]) {
      points = series[metric].map(p => ({ x: p.t, y: safeNumber(p.v) }));
    } else {
      points = history.map(h => ({ x: h.t, y: safeNumber(h.profile[metric]) }));
    }
    return {
      datasets: [
        ds('line', 0, points, {
          label: metricsDefs.find(m => m.key === metric)?.label || metric,
          tension: 0.2,
          spanGaps: true,
          pointRadius: 3,
        })
      ]
    };
  }, [history, series, metric]);

  const barData = useMemo(() => {
    if (!profile) return { labels: [], datasets: [] };
    const wanted = ['daily_income','weekly_income','employees_hired','employees_capacity'];
    const labels = wanted.map(k => metricsDefs.find(m => m.key === k)?.label || k);
    const values = wanted.map(k => safeNumber(profile[k]));
    return { labels, datasets: [ ds('bar', 0, values, { label:'Current Snapshot' }) ] };
  }, [profile]);

  const lineOptions = themedOptions({
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    scales:{
      x:{ type:'time', time:{ unit:'hour', tooltipFormat:'PPpp' } },
      y:{ }
    }
  });

  const barOptions = themedOptions({
    responsive:true, maintainAspectRatio:false,
    scales:{ x:{ grid:{ display:false } }, y:{} },
  });

  return (
    <div style={{ width:'100%', height: chartHeight, display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
        <strong>Company Profile</strong>
        <select value={metric} onChange={e => setMetric(e.target.value)} className="form-select form-select-sm" style={{ width:200 }}>
          {metricsDefs.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button className="btn btn-outline-primary btn-sm" onClick={() => { try { sendWs({ type:'companyProfile' }); } catch {} }}>Refresh</button>
        <button className="btn btn-outline-secondary btn-sm" disabled={loadingHistory} onClick={() => { try { setLoadingHistory(true); sendWs({ type:'getCompanyProfileHistory' }); } catch { setLoadingHistory(false); } }}>{loadingHistory? 'Loading…' : 'Reload History'}</button>
        {snapshot && snapshot.reused && <span className="badge bg-secondary">reused &lt;12h</span>}
        {snapshot && snapshot.inserted && <span className="badge bg-success">new snapshot</span>}
        {snapshot && snapshot.stale && <span className="badge bg-warning text-dark">stale fallback</span>}
        {snapshot && snapshot.timestamp && <span style={{ fontSize:12, opacity:0.7 }}>ts: {new Date(snapshot.timestamp).toLocaleString()}</span>}
      </div>
      <div style={{ flex:1, display:'flex', gap:16 }}>
        <div style={{ flex:2, minWidth:0 }}>
          <Line data={lineData} options={lineOptions} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>
      {profile && (
        <div style={{ marginTop:8, fontSize:12, opacity:0.85 }}>
          Employees: {profile.employees_hired}/{profile.employees_capacity} | Daily Customers: {profile.daily_customers} | Weekly Customers: {profile.weekly_customers}
        </div>
      )}
    </div>
  );
}
