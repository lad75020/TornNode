import { useEffect, useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { getLogsByLogId } from './dbLayer.js';
import useChartTheme from './useChartTheme.js';
import { CHART_HEIGHT } from './chartConstants.js';
import 'chartjs-adapter-date-fns';

// Chart: log = 8731 (timestamp vs data.position)
export default function RacingPositionGraph({ logsUpdated, darkMode, chartHeight = CHART_HEIGHT, dateFrom, dateTo, onMinDate }) {
  const [points, setPoints] = useState([]); // {x: Date(ms), y: position}
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(true);
  const [granularity, setGranularity] = useState('week'); // 'day' | 'week' | 'month'
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
  let entries = await getLogsByLogId(8731);
        // Garder uniquement celles avec data.position chaîne dont le premier caractère est un chiffre
        entries = entries.filter(e => {
          if (!e || typeof e.timestamp !== 'number') return false;
          const p = e?.data?.position;
          if (typeof p === 'string' && p.length > 0 && /[0-9]/.test(p[0])) return true;
          return false;
        });
        entries.sort((a,b)=> a.timestamp - b.timestamp);
        // Map: premier caractère numérique converti en nombre
        const pts = entries.map(e => {
          const first = e.data.position[0];
            const y = parseInt(first, 10);
          return { x: e.timestamp * 1000, y };
        });
        // Min date persistence (use earliest point day)
        if (pts.length && onMinDate) {
          const day = new Date(pts[0].x).toISOString().slice(0,10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(day)) { try { onMinDate(day); } catch {} }
        }
        if (!cancelled) setPoints(pts);
      } catch (e) {
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  // Agrégation par granularité: moyenne des positions + nombre de logs
  const aggregated = useMemo(() => {
    if (!points.length) return { avg: [], counts: [] };

    // Pre-filter raw points by date range (day) before aggregation
    const filteredRaw = (dateFrom || dateTo) ? points.filter(p => {
      const day = new Date(p.x).toISOString().slice(0,10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    }) : points;

    if (granularity === 'day') {
      const buckets = new Map(); // dayStart(ms) -> { sum, count }
      for (const p of filteredRaw) {
        const d = new Date(p.x);
        d.setUTCHours(0,0,0,0);
        const key = d.getTime();
        const b = buckets.get(key) || { sum:0, count:0 };
        b.sum += p.y; b.count += 1; buckets.set(key, b);
      }
      const avg = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.sum / v.count })).sort((a,b)=> a.x - b.x);
      const counts = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.count })).sort((a,b)=> a.x - b.x);
      return { avg, counts };
    }
    if (granularity === 'week') {
      const buckets = new Map(); // weekStart(ms) -> { sum, count }
      function weekStart(ts) {
        const d = new Date(ts);
        const day = d.getUTCDay(); // 0=Sun..6=Sat
        const offset = day === 0 ? 6 : day - 1; // ramener à lundi
        d.setUTCDate(d.getUTCDate() - offset);
        d.setUTCHours(0,0,0,0);
        return d.getTime();
      }
      for (const p of filteredRaw) {
        const w = weekStart(p.x);
        const b = buckets.get(w) || { sum:0, count:0 };
        b.sum += p.y; b.count += 1; buckets.set(w,b);
      }
      const avg = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.sum / v.count })).sort((a,b)=> a.x - b.x);
      const counts = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.count })).sort((a,b)=> a.x - b.x);
      return { avg, counts };
    }
    if (granularity === 'month') {
      const buckets = new Map(); // monthStart(ms) -> { sum, count }
      for (const p of filteredRaw) {
        const d = new Date(p.x);
        d.setUTCDate(1); d.setUTCHours(0,0,0,0);
        const key = d.getTime();
        const b = buckets.get(key) || { sum:0, count:0 };
        b.sum += p.y; b.count += 1; buckets.set(key,b);
      }
      const avg = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.sum / v.count })).sort((a,b)=> a.x - b.x);
      const counts = Array.from(buckets.entries()).map(([k,v])=> ({ x:k, y: v.count })).sort((a,b)=> a.x - b.x);
      return { avg, counts };
    }
    return { avg: filteredRaw, counts: filteredRaw.map(p => ({ x:p.x, y:1 })) };
  }, [points, granularity, dateFrom, dateTo]);

  const data = useMemo(() => ({
    datasets: [
      ds('bar', 0, aggregated.avg, { label: `Avg Position (${granularity})`, parsing:false, barPercentage:0.9, categoryPercentage:0.9, yAxisID:'y' }),
      ds('bar', 1, aggregated.counts, { label: `Count (${granularity})`, parsing:false, barPercentage:0.6, categoryPercentage:0.6, yAxisID:'yCount' })
    ]
  }), [aggregated, granularity]);

  const options = useMemo(() => themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    scales: {
      x: {
        type: 'time',
        time: { tooltipFormat: 'yyyy-MM-dd HH:mm', displayFormats: { hour: 'HH:mm', day: 'yyyy-MM-dd' } },
        title: { display: true, text: 'Timestamp' }
      },
      y: {
        title: { display: true, text: 'Avg position (first digit)' },
        beginAtZero: false
      },
      yCount: {
        position: 'right',
        title: { display: true, text: 'Count' },
        beginAtZero: true,
        grid: { drawOnChartArea: false }
      },
    },
    plugins: {
      legend: { display: true },
      tooltip: {
        callbacks: {
          title: (items) => items.length ? new Date(items[0].parsed.x).toLocaleString() : '',
          label: (ctx) => {
            if (ctx.dataset.yAxisID === 'y') return `Avg Position: ${ctx.parsed.y.toFixed ? ctx.parsed.y.toFixed(2) : ctx.parsed.y}`;
            return `Count: ${ctx.parsed.y}`;
          }
        }
      }
    }
  }), [themedOptions]);

  return (
    <div className="my-4" style={{ height: chartHeight, display:'flex', flexDirection:'column' }}>
      <h5 style={{ cursor:'pointer', userSelect:'none', marginBottom:8 }} title="Afficher / cacher" onClick={()=> setShow(s=>!s)}>
  Racing Position – Avg & Count ({aggregated.avg.length} {granularity}{aggregated.avg.length>1?'s':''}, {points.length} raw pts)
      </h5>
      {loading ? (
        <div>Loading…</div>
      ) : show && (
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, display:'flex', flexDirection:'column', gap:4, padding:4, zIndex:5 }}>
            {['day','week','month'].map(g => (
              <button key={g} onClick={()=> setGranularity(g)}
                style={{
                  writingMode:'vertical-rl',
                  transform:'rotate(180deg)',
                  background: granularity===g ? (darkMode? '#556':'#ddd') : (darkMode?'#333':'#f6f6f6'),
                  color: darkMode? '#fff':'#222',
                  border:'1px solid '+(darkMode?'#777':'#ccc'),
                  borderRadius:4,
                  cursor:'pointer',
                  fontSize:11,
                  padding:'6px 4px'
                }}>{g}</button>
            ))}
          </div>
          <div style={{ marginLeft:40, height:'100%' }}>
            <Bar data={data} options={options} />
          </div>
        </div>
      )}
    </div>
  );
}
// (Wrapper supprimé; import direct Line pour éviter require non défini en ESM)
