import { useEffect, useState, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';

/*
 Flux simplifié:
 1. Appel direct: JSON { type:'companyStock' } -> backend wsCompanyStock.cjs (fetch Torn API + insert Mongo + renvoie snapshot immédiat)
 2. Refresh: même message { type:'companyStock' } (anti-spam 5s)
 Aucune relecture séparée getCompanyStock: la réponse companyStock contient déjà les données pertinentes.
*/
export default function CompanyStockChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400 }) {
  const [dataRows, setDataRows] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [lastError, setLastError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastRequestRef = useRef(0);
  const { themedOptions, ds } = useChartTheme(darkMode);

  // Ecoute des messages WS via bus
  useWsMessageBus(wsMessages, {
    onCompanyStock: (parsed) => {
      if (parsed.ok) {
        let rows = [];
        if (Array.isArray(parsed.stock)) {
          rows = parsed.stock.map((v,i) => ({
            ...v,
            name: v?.name || v?.item || v?.item_name || `item_${i}`
          }));
        } else if (parsed.stock && typeof parsed.stock === 'object') {
          try {
            rows = Object.entries(parsed.stock).map(([key, v], i) => ({
              ...v,
              name: v?.name || v?.item || v?.item_name || key || `item_${i}`
            }));
          } catch { rows = []; }
        }
        try { rows.sort((a,b) => (b?.sold_worth||0) - (a?.sold_worth||0)); } catch {}
        setDataRows(rows);
        setLastError(null);
      } else if (parsed.error) {
        setLastError(parsed.error);
      }
      setLoading(false);
    }
  });

  // Chargement initial + refresh utilisent le même message companyStock
  const loadInitial = () => {
    if (!wsRef || !wsRef.current || wsRef.current.readyState !== 1) return;
    setLoading(true); setLastError(null);
    try { sendWs(JSON.stringify({ type:'companyStock' })); } catch { setLoading(false); }
  };
  // Refresh explicite (fetch Torn + insert + retour snapshot)
  const refreshData = () => {
    if (!wsRef || !wsRef.current || wsRef.current.readyState !== 1) return;
    if (Date.now() - lastRequestRef.current < 5000) return; // anti-spam
    lastRequestRef.current = Date.now();
    setLoading(true); setLastError(null);
    try { sendWs(JSON.stringify({ type:'companyStock' })); } catch { setLoading(false); }
  };
  useEffect(() => { loadInitial(); }, []); // mount

  // Ajuster selectedName quand nouvelles données
  useEffect(() => {
    if (!dataRows.length) return;
    if (!selectedName || !dataRows.some(r => r.name === selectedName)) {
      // Choisir premier item des 5/6 attendus
      setSelectedName(dataRows[0].name);
    }
  }, [dataRows, selectedName]);

  const current = dataRows.find(r => r.name === selectedName) || null;
  const metricTriplet = current ? {
    in_stock: current.in_stock || 0,
    on_order: current.on_order || 0,
    sold_amount: current.sold_amount || 0
  } : { in_stock:0, on_order:0, sold_amount:0 };

  // Utiliser le dernier timestamp reçu parmi les messages companyStock pertinents (on peut stocker via dataRows side-effect, mais on ne l'a pas en state; on cherche dans wsMessages dernier companyStock ok)
  let lastTs = null;
  if (wsMessages && wsMessages.length) {
    for (let i = wsMessages.length - 1; i >= 0; i--) {
      const raw = wsMessages[i];
      if (!raw || raw[0] !== '{') continue;
      try {
        const p = JSON.parse(raw);
        if (p && p.type === 'companyStock' && p.ok && typeof p.timestamp === 'number') { lastTs = p.timestamp; break; }
      } catch {}
    }
  }
  // Fallback: Date.now() si pas trouvé
  if (!lastTs) lastTs = Date.now();

  // Construire trois datasets distincts (facile à étendre si on veut empiler historiques plus tard)
  const chartData = {
    datasets: [
      ds('bar', 0, [{ x: lastTs, y: metricTriplet.in_stock }], { label: 'In Stock' }),
      ds('bar', 1, [{ x: lastTs, y: metricTriplet.on_order }], { label: 'On Order' }),
      ds('bar', 2, [{ x: lastTs, y: metricTriplet.sold_amount }], { label: 'Sold Amount' })
    ]
  };

  const options = themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'minute' },
        ticks: { maxRotation: 0 },
        title: { display: true, text: 'Timestamp' }
      },
      y: { beginAtZero: true, title: { display: true, text: 'Value' } }
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: { enabled: true }
    }
  });

  return (
    <div style={{ width: '100%', height: chartHeight, position: 'relative' }}>
      <div className="d-flex align-items-center justify-content-between mb-2" style={{ gap: 8 }}>
        <h6 className="m-0">Company Stock (111803)</h6>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <select
            className="form-select form-select-sm"
            style={{ minWidth:180 }}
            value={selectedName}
            onChange={e => setSelectedName(e.target.value)}
            disabled={!dataRows.length}
            title="Sélectionner l'objet"
          >
            {dataRows.map(r => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
          <button className="btn btn-sm btn-outline-primary" onClick={refreshData} disabled={loading} title="Fetch latest & store">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>
      {lastError && (
        <div className="alert alert-danger py-1 px-2" style={{ fontSize: 12 }}>{lastError}</div>
      )}
      {!dataRows.length && !loading && !lastError && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>No data</div>
      )}
      <Bar data={chartData} options={options} />
    </div>
  );
}
