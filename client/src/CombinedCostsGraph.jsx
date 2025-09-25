import { useEffect, useState } from 'react';
import JsonPreview from './JsonPreview.jsx';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, BarElement, Title, Tooltip, Legend);

// Helper: ISO week key (YYYY-Www)
function isoWeekKey(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export default function CombinedCostsGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [granularity, setGranularity] = useState('daily'); // daily | weekly | monthly
  const [baseDaily, setBaseDaily] = useState({ labels: [], seriesA: [], seriesB: [] });
  const [chartData, setChartData] = useState({ labels: [], seriesA: [], seriesB: [] });
  const [totals, setTotals] = useState({ A: 0, B: 0 });
  const [showChart, setShowChart] = useState(true);
  const [modal, setModal] = useState({ open: false, label: null, payload: null });
  const { themedOptions } = useChartTheme(darkMode);

  // Normalisation des montants (gère chaînes avec virgules, $ etc.)
  function toNum(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.-]/g, '');
      const num = Number(cleaned);
      return isFinite(num) ? num : 0;
    }
    return 0;
  }

  useEffect(() => {
    async function load() {
      // Fetch logs for the four IDs
      const [l1103, l1104, l1112, l1113] = await Promise.all([
        getLogsByLogId(1103),
        getLogsByLogId(1104),
        getLogsByLogId(1112),
        getLogsByLogId(1113)
      ]);

      const dayA = {}; // series A (1103 cost + 1112 cost_total)
      const dayB = {}; // series B (1104 cost + 1113 cost_total)

      for (const e of l1103) {
        const day = new Date(e.timestamp * 1000).toISOString().slice(0, 10);
        const v = toNum(e?.data?.cost);
        dayA[day] = (dayA[day] || 0) + v;
      }
      for (const e of l1112) {
        const day = new Date(e.timestamp * 1000).toISOString().slice(0, 10);
        const v = toNum(e?.data?.cost_total);
        dayA[day] = (dayA[day] || 0) + v;
      }
      for (const e of l1104) {
        const day = new Date(e.timestamp * 1000).toISOString().slice(0, 10);
        const v = toNum(e?.data?.cost);
        dayB[day] = (dayB[day] || 0) + v;
      }
      for (const e of l1113) {
        const day = new Date(e.timestamp * 1000).toISOString().slice(0, 10);
        const v = toNum(e?.data?.cost_total);
        dayB[day] = (dayB[day] || 0) + v;
      }

      const allDays = Array.from(new Set([...Object.keys(dayA), ...Object.keys(dayB)])).sort();
      const seriesA = allDays.map(d => dayA[d] || 0);
      const seriesB = allDays.map(d => dayB[d] || 0);
  setBaseDaily({ labels: allDays, seriesA, seriesB });
  try { console.debug('[CombinedCostsGraph] daily labels', allDays.length, 'A[0]', seriesA[0], 'B[0]', seriesB[0]); } catch {}
      setTotals({ A: seriesA.reduce((a, c) => a + c, 0), B: seriesB.reduce((a, c) => a + c, 0) });
    }
    load();
  }, [logsUpdated]);

  useEffect(() => {
    if (!baseDaily.labels.length) return;
    let labels = [];
    let A = [];
    let B = [];
    if (granularity === 'daily') {
      labels = baseDaily.labels;
      A = baseDaily.seriesA;
      B = baseDaily.seriesB;
    } else if (granularity === 'weekly') {
      const acc = new Map();
      for (let i = 0; i < baseDaily.labels.length; i++) {
        const wk = isoWeekKey(baseDaily.labels[i]);
        const cur = acc.get(wk) || { A: 0, B: 0 };
        cur.A += baseDaily.seriesA[i];
        cur.B += baseDaily.seriesB[i];
        acc.set(wk, cur);
      }
      labels = Array.from(acc.keys());
      A = labels.map(l => acc.get(l).A);
      B = labels.map(l => acc.get(l).B);
    } else if (granularity === 'monthly') {
      const acc = new Map();
      for (let i = 0; i < baseDaily.labels.length; i++) {
        const m = baseDaily.labels[i].slice(0, 7); // YYYY-MM
        const cur = acc.get(m) || { A: 0, B: 0 };
        cur.A += baseDaily.seriesA[i];
        cur.B += baseDaily.seriesB[i];
        acc.set(m, cur);
      }
      labels = Array.from(acc.keys());
      A = labels.map(l => acc.get(l).A);
      B = labels.map(l => acc.get(l).B);
    }
    if (granularity === 'daily' && labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
      try { onMinDate(labels[0]); } catch {}
    }
    if (granularity === 'daily') {
      const filtered = filterDatasetsByDate(labels, [ { label:'Purchases', data:A }, { label:'Sales', data:B } ], dateFrom, dateTo);
      setChartData({ labels: filtered.labels, seriesA: filtered.datasets[0].data, seriesB: filtered.datasets[1].data });
    } else {
      setChartData({ labels, seriesA: A, seriesB: B });
    }
  }, [granularity, baseDaily, dateFrom, dateTo, onMinDate]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(p => !p)}
        title="Click to show/hide chart"
      >
       Item Market Purchases & Sales – {granularity}
      </h5>
      {showChart && (
        <>
          <div style={{ position: 'relative', height: chartHeight }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 4px', zIndex: 5 }}>
              {['daily', 'weekly', 'monthly'].map(g => (
                <button key={g} onClick={() => setGranularity(g)}
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    background: granularity === g ? (darkMode ? '#555' : '#ddd') : (darkMode ? '#333' : '#f5f5f5'),
                    color: darkMode ? '#fff' : '#222',
                    border: '1px solid ' + (darkMode ? '#777' : '#ccc'),
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '6px 4px'
                  }}>{g}</button>
              ))}
            </div>
            <div style={{ height: '100%', marginLeft: 40 }}>
              <Bar
                data={{
                  labels: chartData.labels,
                  datasets: [
                    {
                      label: 'Purchases',
                      data: chartData.seriesA.map(v => (v > 0 ? v : null)),
                      backgroundColor: darkMode ? 'rgba(80,160,255,0.65)' : 'rgba(20,90,180,0.85)',
                      borderColor: darkMode ? 'rgba(120,190,255,1)' : 'rgba(30,110,200,1)',
                      borderWidth: 1
                    },
                    {
                      label: 'Sales',
                      data: chartData.seriesB.map(v => (v > 0 ? v : null)),
                      backgroundColor: darkMode ? 'rgba(255,140,90,0.65)' : 'rgba(230,90,20,0.85)',
                      borderColor: darkMode ? 'rgba(255,170,130,1)' : 'rgba(240,110,40,1)',
                      borderWidth: 1
                    }
                  ]
                }}
                options={themedOptions({
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (evt, elements, chart) => {
                    if (!elements || !elements.length) return;
                    const el = elements[0];
                    const idx = el.index;
                    const label = chart.data.labels[idx];
                    if (!label) return;
                    const purchase = chartData.seriesA[idx] || 0;
                    const sales = chartData.seriesB[idx] || 0;
                    const ratio = purchase ? (sales / purchase) : null;
                    const payload = {
                      granularity,
                      bucket: label,
                      purchase,
                      sales,
                      ratio,
                      totals,
                      percentOfTotalPurchases: totals.A ? (purchase / totals.A) : 0,
                      percentOfTotalSales: totals.B ? (sales / totals.B) : 0
                    };
                    setModal({ open: true, label, payload });
                  },
                  plugins: { legend: { display: true }, title: { display: false } },
                  scales: {
                    x: { title: { display: true, text: granularity === 'daily' ? 'Day' : granularity === 'weekly' ? 'Week' : 'Month' } },
                    y: {
                      type: 'logarithmic',
                      title: { display: true, text: 'Sum cost (log)' },
                      ticks: {
                        callback: (val) => {
                          // Montrer des valeurs lisibles (1,2,5 * 10^n)
                          const v = Number(val);
                          const mant = v / Math.pow(10, Math.floor(Math.log10(v)));
                          if ([1,2,5].includes(Math.round(mant))) return v.toLocaleString();
                          return '';
                        }
                      },
                      min: 1
                    }
                  },
                  interaction: { intersect: false, mode: 'index' },
                })}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
            Total Purchases: {totals.A.toLocaleString()} | Total Sales: {totals.B.toLocaleString()}
          </div>
        </>
      )}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2100, display: 'flex', flexDirection: 'column' }} onClick={() => setModal({ open: false, label: null, payload: null })}>
          <div style={{ margin: '40px auto', background: '#fff', color: '#222', padding: '16px 20px', borderRadius: 8, maxWidth: '90%', maxHeight: '80%', overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h6 style={{ margin: 0 }}>Bucket {modal.label}</h6>
              <button className="btn btn-sm btn-secondary" onClick={() => setModal({ open: false, label: null, payload: null })}>Close</button>
            </div>
            <JsonPreview value={modal.payload} style={{ fontSize: 14 }} />
          </div>
        </div>
      )}
    </div>
  );
}
