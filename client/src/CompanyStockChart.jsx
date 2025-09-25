import { useEffect, useState, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns';
import useChartTheme from './useChartTheme.js';

try { ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, TimeScale); } catch {}

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
  const { themedOptions } = useChartTheme(darkMode);

  // Ecoute des messages WS pour récupérer companyStock (fetch + insert)
  useEffect(() => {
    if (!wsMessages || !wsMessages.length) return;
    // Traiter uniquement les nouveaux messages
    const slice = wsMessages.slice(-30); // fenêtre récente suffisante
    for (let i = slice.length - 1; i >= 0; i--) {
      const raw = slice[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed) continue;
      if (parsed.type === 'companyStock') {
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
          // Tri optionnel par sold_worth desc si présent
          try {
            rows.sort((a,b) => (b?.sold_worth||0) - (a?.sold_worth||0));
          } catch {}
          
          //rows.name = parsed.name || null;
          setDataRows(rows);
          setLastError(null);
        } else if (parsed.error) {
          setLastError(parsed.error);
        }
        setLoading(false);
        break;
      }
    }
  }, [wsMessages]);

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
      {
        label: 'In Stock',
        data: [{ x: lastTs, y: metricTriplet.in_stock }],
        backgroundColor: 'rgba(54,162,235,0.7)'
      },
      {
        label: 'On Order',
        data: [{ x: lastTs, y: metricTriplet.on_order }],
        backgroundColor: 'rgba(255,206,86,0.7)'
      },
      {
        label: 'Sold Amount',
        data: [{ x: lastTs, y: metricTriplet.sold_amount }],
        backgroundColor: 'rgba(255,99,132,0.7)'
      }
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
