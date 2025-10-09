import { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
// Adapter temps déjà enregistré via chartSetup
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';

/*
  Historique Company Stock:
  - Lecture via { type:'getCompanyStockHistory', from, to, top }
  - series.totalInStock: [{ t, v }]
  - series.items: name -> [{ t, v, p }]
  Affiche: Total (axe gauche) + pour chaque item topN la courbe in_stock; optionnel prix (axe droite togglable)
*/
export default function CompanyStockHistoryChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400 }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [series, setSeries] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const lastQueryRef = useRef({ from:null, to:null, top:5 });

  // Ecoute messages via bus
  useWsMessageBus(wsMessages, {
    onCompanyStockHistory: (parsed) => {
      if (parsed.ok) {
        setSeries(parsed.series || null);
        setMeta(parsed.meta || null);
        setError(null);
      } else setError(parsed.error || 'error');
      setLoading(false);
    }
  });

  const loadHistory = (opts={}) => {
    if (!wsRef || !wsRef.current || wsRef.current.readyState !== 1) return;
    const now = Date.now();
    const from = opts.from ?? (now - 7 * 24*3600*1000);
    const to = opts.to ?? now;
    const top = opts.top ?? lastQueryRef.current.top ?? 5;
    lastQueryRef.current = { from, to, top };
    setLoading(true);
    try { sendWs(JSON.stringify({ type:'getCompanyStockHistory', from, to, top })); } catch { setLoading(false); }
  };
  useEffect(()=>{ loadHistory({}); }, []);

  const datasets = [];
  if (series && series.totalInStock) {
    datasets.push(
      ds('line', 0, series.totalInStock.map(p => ({ x: p.t, y: p.v })), {
        label: 'Total In Stock',
        pointRadius: 2,
        tension: 0.1,
        yAxisID: 'y'
      })
    );
  }
  if (series && series.items) {
    let idx = 1;
    for (const [name, arr] of Object.entries(series.items)) {
      const base = arr.map(p => ({ x: p.t, y: p.v }));
      datasets.push(
        ds('line', idx++, base, {
          label: `${name} (stock)`,
          pointRadius: 0,
          tension: 0.15,
          yAxisID: 'y'
        })
      );
      if (showPrices) {
        const price = arr.map(p => ({ x: p.t, y: p.p }));
        datasets.push(
          ds('line', idx++, price, {
            label: `${name} (price)`,
            pointRadius: 0,
            tension: 0.15,
            borderDash: [4,4],
            yAxisID: 'y1'
          })
        );
      }
    }
  }

  const data = { datasets };
  const options = themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    normalized: true,
    scales: {
      x: {
        type: 'time',
        time: {
          // Choix de l'unité: heure si plage courte (< 36h), sinon semaine (par défaut)
          unit: meta && meta.from && meta.to && (meta.to - meta.from) < 36*3600*1000 ? 'hour' : 'week',
          tooltipFormat: 'PPpp'
        },
        ticks: {
          source: 'auto',
          maxRotation: 0,
          autoSkip: true
        },
        title: { display:true, text: 'Date' },
        grid:{ color: darkMode? 'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)' }
      },
      y: { beginAtZero: true, title: { display:true, text:'Stock Qty' }, grid:{ color: darkMode? 'rgba(255,255,255,0.08)':'rgba(0,0,0,0.08)' } },
      y1: { beginAtZero: true, position: 'right', title: { display:true, text:'Price' }, grid:{ drawOnChartArea:false } }
    },
    interaction: { mode:'nearest', intersect:false },
    plugins: { legend:{ position:'top' }, tooltip:{ enabled:true } }
  });

  return (
    <div style={{ width:'100%', height: chartHeight }}>
      <div className="d-flex align-items-center justify-content-between mb-2" style={{ gap:8 }}>
        <h6 className="m-0">Company Stock History</h6>
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-outline-secondary" onClick={()=> setShowPrices(v=>!v)}>
            {showPrices? 'Hide Prices':'Show Prices'}
          </button>
          <button className="btn btn-sm btn-outline-info" onClick={()=> loadHistory({ from: Date.now()-30*24*3600*1000, to: Date.now(), top: lastQueryRef.current.top })}>
            30d
          </button>
        </div>
      </div>
      {error && <div className="alert alert-danger py-1 px-2" style={{ fontSize:12 }}>{error}</div>}
      {!error && !series && !loading && <div style={{ fontSize:12, opacity:0.6 }}>No history</div>}
      <Line data={data} options={options} />
      {meta && (
        <div style={{ fontSize:10, opacity:0.6, marginTop:4 }}>
          Range: {new Date(meta.from).toLocaleString()} → {new Date(meta.to).toLocaleString()} | Points: {meta.points} | Top: {meta.top}
        </div>
      )}
    </div>
  );
}
