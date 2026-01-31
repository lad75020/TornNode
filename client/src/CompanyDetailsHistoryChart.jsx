import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';

/*
  CompanyDetailsHistoryChart (squelette)
  - Récupère l'historique via { type:'getCompanyDetailsHistory', from, to }
  - Ne mappe pas Y (à compléter par l'appelant). X = timestamp (ms).
  - Fournit une prop optionnelle mapToDatasets(series) => datasets[] pour brancher facilement la représentation.
*/
export default function CompanyDetailsHistoryChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 360, mapToDatasets }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [series, setSeries] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastQueryRef = useRef({ from:null, to:null });

  // Ecoute des messages via bus
  useWsMessageBus(wsMessages, {
    onCompanyDetailsHistory: (parsed) => {
      if (parsed.ok) {
        setSeries(parsed.series || null);
        setMeta({ ...(parsed.meta || {}), lastTimestamp: parsed.lastTimestamp });
        setError(null);
      } else setError(parsed.error || 'error');
      setLoading(false);
    }
  });

  const loadHistory = (opts = {}) => {
    if (!wsRef || !wsRef.current || wsRef.current.readyState !== 1) return;
    const now = Date.now();
    const from = opts.from ?? (now - 7*24*3600*1000);
    const to = opts.to ?? now;
    lastQueryRef.current = { from, to };
    setLoading(true);
    try { sendWs(JSON.stringify({ type:'getCompanyDetailsHistory', from, to })); } catch { setLoading(false); }
  };
  useEffect(() => { loadHistory({}); }, []);

  // Datasets: si mapToDatasets n'est pas fourni, on affiche popularity, environment, efficiency par défaut.
  const datasets = useMemo(() => {
    if (!series) return [];
    if (typeof mapToDatasets === 'function') {
      try { return mapToDatasets(series) || []; } catch { return []; }
    }
    const keys = ['popularity','environment','efficiency'];
    const palette = {
      popularity: '#f67019',
      environment: '#4dc9f6',
      efficiency: '#acc236'
    };
    const out = [];
    for (const k of keys) {
      const arr = series[k];
      if (!Array.isArray(arr) || !arr.length) continue;
      out.push(
        ds('line', out.length, arr.map(p => ({ x: p.t, y: p.v })), {
          label: k[0].toUpperCase()+k.slice(1),
          pointRadius: 0,
          tension: 0.15,
          borderColor: palette[k] || undefined,
          backgroundColor: palette[k] || undefined,
        })
      );
    }
    return out;
  }, [series, mapToDatasets]);

  const data = { datasets };
  const options = themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    normalized: true,
    scales: {
      x: {
        type: 'time',
        time: { unit: meta && meta.from && meta.to && (meta.to - meta.from) < 36*3600*1000 ? 'hour' : 'day', tooltipFormat: 'PPpp' },
        ticks: { source:'auto', maxRotation:0, autoSkip:true },
        title: { display:true, text: 'Date' }
      },
      y: { beginAtZero: true, title: { display:true, text:'Value (mappez Y)' } }
    },
    interaction: { mode:'nearest', intersect:false },
    plugins: { legend:{ position:'top' }, tooltip:{ enabled:true } }
  });

  return (
    <div style={{ width:'100%', height: chartHeight }}>
      <div className="d-flex align-items-center justify-content-between mb-2" style={{ gap:8 }}>
        <h6 className="m-0">Company Details History</h6>
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-outline-primary" disabled={loading} onClick={()=> loadHistory(lastQueryRef.current)}>
            {loading? 'Loading…':'Reload'}
          </button>
          <button className="btn btn-sm btn-outline-info" onClick={()=> loadHistory({ from: Date.now()-7*24*3600*1000, to: Date.now() })}>
            7d
          </button>
          <button className="btn btn-sm btn-outline-info" onClick={()=> loadHistory({ from: Date.now()-30*24*3600*1000, to: Date.now() })}>
            30d
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger py-1 px-2" style={{ fontSize:12 }}>{error}</div>}
      {!error && series && datasets.length === 0 && (
        <div style={{ fontSize:12, opacity:0.7, marginBottom:4 }}>Aucun dataset mappé. Fournissez mapToDatasets(series) pour afficher des courbes. X = timestamp.</div>
      )}
      <Line data={data} options={options} />
      {meta && (
        <div style={{ fontSize:10, opacity:0.6, marginTop:4 }}>
          Range: {meta.from ? new Date(meta.from).toLocaleString() : '-'} → {meta.to ? new Date(meta.to).toLocaleString() : '-'}
          {meta.lastTimestamp ? ` | Last: ${new Date(meta.lastTimestamp).toLocaleString()}` : ''}
        </div>
      )}
    </div>
  );
}
