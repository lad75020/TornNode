import { useEffect, useState, useRef, useMemo } from 'react';
import useChartTheme from './useChartTheme.js';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

/**
 * NetworthPieChart
 * Récupère via WebSocket (message 'lastNetworth') la dernière répartition networth
 * et l'affiche en camembert.
 */
export default function NetworthPieChart({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 420 }) {
  const { themedOptions, theme } = useChartTheme(darkMode);
  const [networth, setNetworth] = useState(null);
  const requestedRef = useRef(false);

  // Envoi initial + rafraîchissement périodique toutes les 12h
  useEffect(() => {
    function request() {
      if (wsRef && wsRef.current && wsRef.current.readyState === 1) {
        try { sendWs && sendWs('lastNetworth'); } catch(_) {}
      }
    }
    if (!requestedRef.current) {
      request();
      requestedRef.current = true;
    }
    const interval = setInterval(request, 12 * 60 * 60 * 1000); // 12h
    return () => clearInterval(interval);
  }, [wsRef, sendWs]);

  // Écoute des nouveaux messages pour capter lastNetworth
  useEffect(() => {

    if (!wsMessages || wsMessages.length === 0) return;
    const last = wsMessages[wsMessages.length - 1];

    if (!last || !last.startsWith('{')) return;
    try {
      const parsed = JSON.parse(last);

      if (parsed && parsed.type === 'lastNetworth' && parsed.networth && !parsed.error) {
        setNetworth(parsed.networth);
      }
    } catch(_) {}
  }, [wsMessages]);

  const { data, total, sortedParts } = useMemo(() => {
    if (!networth) return { data: null, total: 0, sortedParts: [] };
    // Mapping label lisible -> clé objet
    const mapping = [
      ['Wallet', 'networthwallet'],
      ['Vault', 'networthvault'],
      ['Bank', 'networthbank'],
      ['Cayman', 'networthcayman'],
      ['Points', 'networthpoints'],
      ['Items', 'networthitems'],
      ['DisplayCase', 'networthdisplaycase'],
      ['Bazaar', 'networthbazaar'],
      ['ItemMarket', 'networthitemmarket'],
      ['Properties', 'networthproperties'],
      ['StockMarket', 'networthstockmarket'],
      ['Auction', 'networthauctionhouse'],
      ['Bookie', 'networthbookie'],
      ['Company', 'networthcompany'],
      ['EnlistedCars', 'networthenlistedcars'],
      ['PiggyBank', 'networthpiggybank'],
      ['Pending', 'networthpending']
    ];
    const parts = [];
    for (const [lbl, key] of mapping) {
      const v = Number(networth[key]);
      if (Number.isFinite(v) && v !== 0) parts.push({ label: lbl, value: v, key });
    }
    // Total brut avant fusion
    const totalVal = parts.reduce((a,b)=> a + b.value, 0);
    const threshold = totalVal * 0.01; // 1%
    const mainParts = [];
    let otherSum = 0;
    for (const p of parts) {
      if (p.value < threshold) otherSum += p.value; else mainParts.push(p);
    }
    if (otherSum > 0) mainParts.push({ label: 'Other', value: otherSum, key: 'other' });
    // Tri décroissant après fusion
    mainParts.sort((a,b)=> b.value - a.value);
    const labels = mainParts.map(p=> p.label);
    const values = mainParts.map(p=> p.value);
    // Couleurs: réutiliser palette lignes, la répéter si nécessaire
    const palette = theme.linePalette || [];
    const bg = labels.map((_,i)=>{
      const c = palette[i % palette.length] || '#8884d8';
      // s'assurer d'une opacité ~0.7 si pas déjà
      if (/rgba\(/.test(c) && !/0\.7\)/.test(c)) return c.replace(/\d?\.\d+\)$/,'0.7)');
      return c;
    });
    const border = bg.map(c => {
      let out = c;
      out = out.replace(/0\.7\)/, '1)').replace(/0\.6\)/, '1)').replace(/0\.5\)/, '1)');
      return out;
    });
    return {
      total: totalVal,
      sortedParts: parts,
      data: {
        labels,
        datasets: [
          {
            label: 'Networth distribution',
            data: values,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: 1,
          }
        ]
      }
    };
  }, [networth, theme]);

  return (
    <div style={{ height: chartHeight, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flex:'0 0 auto' }} className="d-flex align-items-center justify-content-between mb-1">
        <h5 className="m-0" style={{ cursor:'pointer', userSelect:'none', fontSize: '1rem' }} title="Dernière répartition networth">Networth Breakdown</h5>
        <div className="btn-group btn-group-sm">
          <button className="btn btn-outline-secondary" onClick={()=>{ try { sendWs('lastNetworth'); } catch(_) {} }} title="Rafraîchir">↻</button>
        </div>
      </div>
      {!data ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:8 }}>
          <div>Aucune donnée</div>
          <button className="btn btn-sm btn-outline-primary mt-2" onClick={()=>{ try { sendWs('lastNetworth'); requestedRef.current = true; } catch(_) {} }}>Refresh</button>
        </div>
      ) : (
        <>
          <div style={{ flex:1, minHeight:0, position:'relative' }}>
            <Pie
              data={data}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                  legend: { position: 'right', labels: { boxWidth: 14 } },
                  tooltip: { callbacks: { label: (ctx) => {
                    const val = ctx.parsed || 0;
                    const pct = total ? ((val/total)*100).toFixed(1) : '0.0';
                    return `${ctx.label}: ${val.toLocaleString()} (${pct}%)`;
                  } } },
                  title: { display: true, text: `Total: ${total.toLocaleString()}` }
                }
              })}
            />
          </div>
          <div style={{ flex:'0 0 160px', overflowY:'auto', fontSize:12, marginTop:4, borderTop:'1px solid rgba(128,128,128,0.25)' }}>
            <table className="table table-sm table-striped mb-0" style={{ position:'relative' }}>
              <thead className="sticky-top" style={{ background: darkMode ? '#222' : '#f8f9fa' }}>
                <tr>
                  <th>Part</th>
                  <th>Valeur</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {sortedParts.map(p => {
                  const pct = total ? ((p.value/total)*100).toFixed(2) : '0.00';
                  return (
                    <tr key={p.key}>
                      <td>{p.label}</td>
                      <td>{p.value.toLocaleString()}</td>
                      <td>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
