import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Bar } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';

export default function XanaxBarGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [data, setData] = useState({ labels: [], counts2290: [], counts2291: [], cumulative2290: [], average2290: 0 });
  const [dailyBase, setDailyBase] = useState({ labels: [], counts2290: [], counts2291: [] });
  const [granularity, setGranularity] = useState('daily');
  const [showChart, setShowChart] = useState(true);
  const [totalXanax, setTotalXanax] = useState(null);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchDaily() {
      const all2290 = await getLogsByLogId(2290);
      const dayCounts2290 = {};
      for (const obj of all2290) {
        const day = new Date(obj.timestamp * 1000).toISOString().slice(0, 10);
        dayCounts2290[day] = (dayCounts2290[day] || 0) + 1;
      }
      const all2291 = await getLogsByLogId(2291);
      const dayCounts2291 = {};
      for (const obj of all2291) {
        const day = new Date(obj.timestamp * 1000).toISOString().slice(0, 10);
        dayCounts2291[day] = (dayCounts2291[day] || 0) + 1;
      }
      const allDays = Array.from(new Set([...Object.keys(dayCounts2290), ...Object.keys(dayCounts2291)])).sort();
      const counts2290 = allDays.map(day => dayCounts2290[day] || 0);
      const counts2291 = allDays.map(day => dayCounts2291[day] || 0);
      setDailyBase({ labels: allDays, counts2290, counts2291 });
      const total = counts2290.reduce((acc, v) => acc + v, 0);
      setTotalXanax(total);
      recomputeAggregates('daily', { labels: allDays, counts2290, counts2291 });
    }
    fetchDaily();
  }, [logsUpdated]);

  function recomputeAggregates(gran, base) {
    const src = base || dailyBase;
    if (!src.labels.length) return;
    // Filtrage range sur base quotidienne avant agrégation
    let ranged = src;
    if (dateFrom || dateTo) {
      const labels = [];
      const c2290 = [];
      const c2291 = [];
      for (let i=0;i<src.labels.length;i++) {
        const d = src.labels[i];
        if (dateFrom && d < dateFrom) continue;
        if (dateTo && d > dateTo) continue;
        labels.push(d);
        c2290.push(src.counts2290[i]);
        c2291.push(src.counts2291[i]);
      }
      ranged = { labels, counts2290: c2290, counts2291: c2291 };
    }
    if (ranged.labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(ranged.labels[0])) {
      try { onMinDate(ranged.labels[0]); } catch {}
    }
    let labels = [];
    let g2290 = [];
    let g2291 = [];
    if (gran === 'daily') {
      labels = ranged.labels;
      g2290 = ranged.counts2290;
      g2291 = ranged.counts2291;
    } else if (gran === 'weekly') {
      const accW = new Map();
      for (let i=0;i<ranged.labels.length;i++) {
        const dStr = ranged.labels[i];
        const date = new Date(dStr + 'T00:00:00Z');
        const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay()||7));
        const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1)/7);
        const key = `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
        const cur = accW.get(key) || { xanax:0, od:0 };
        cur.xanax += ranged.counts2290[i];
        cur.od += ranged.counts2291[i];
        accW.set(key, cur);
      }
      labels = Array.from(accW.keys());
      g2290 = labels.map(l => accW.get(l).xanax);
      g2291 = labels.map(l => accW.get(l).od);
    } else if (gran === 'monthly') {
      const accM = new Map();
      for (let i=0;i<ranged.labels.length;i++) {
        const key = ranged.labels[i].slice(0,7);
        const cur = accM.get(key) || { xanax:0, od:0 };
        cur.xanax += ranged.counts2290[i];
        cur.od += ranged.counts2291[i];
        accM.set(key, cur);
      }
      labels = Array.from(accM.keys());
      g2290 = labels.map(l => accM.get(l).xanax);
      g2291 = labels.map(l => accM.get(l).od);
    }
    const cumulative2290 = [];
    g2290.reduce((acc, v, i) => { const n = acc + v; cumulative2290[i] = n; return n; }, 0);
    const avg = g2290.length ? g2290.reduce((a,c)=>a+c,0)/g2290.length : 0;
    setData({ labels, counts2290: g2290, counts2291: g2291, cumulative2290, average2290: avg });
  }

  useEffect(() => { recomputeAggregates(granularity); }, [granularity, dailyBase]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Xanax taken ({granularity}) and Overdoses
      </h5>
      {showChart && (
        <>
          <div style={{ position:'relative', height: chartHeight }}>
            <div style={{ position:'absolute', left:0, top:0, bottom:0, display:'flex', flexDirection:'column', gap:6, padding:'4px 4px', zIndex:5 }}>
              {['daily','weekly','monthly'].map(g => (
                <button key={g} onClick={()=> setGranularity(g)}
                  style={{
                    writingMode:'vertical-rl',
                    transform:'rotate(180deg)',
                    background: granularity===g ? (darkMode? '#555':'#ddd') : (darkMode?'#333':'#f5f5f5'),
                    color: darkMode? '#fff':'#222',
                    border:'1px solid '+(darkMode?'#777':'#ccc'),
                    borderRadius:4,
                    cursor:'pointer',
                    fontSize:11,
                    padding:'6px 4px'
                  }}>{g}</button>
              ))}
            </div>
            <div style={{ height:'100%', marginLeft:40 }}>
          <Bar
            data={{
              labels: data.labels,
              datasets: [
                ds('bar', 0, data.counts2290, { label: 'Xanax', borderWidth: 1 }),
                ds('bar', 1, data.counts2291, { label: 'Overdoses', borderWidth: 1 }),
                ds('line', 2, data.labels.map(()=> data.average2290), { label: 'Average Xanax', borderDash:[6,4], pointRadius:0, tension:0, yAxisID:'y', order:2, backgroundColor:'transparent' }),
                ds('line', 3, data.cumulative2290, { label: 'Cumulative Xanax', tension:0.25, yAxisID:'y2', pointRadius:2, pointHoverRadius:4, fill:false, order:3 })
              ],
            }}
            options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true },
                title: { display: false },
              },
              scales: {
                x: { title: { display: true, text: granularity==='daily' ? 'Day' : granularity==='weekly' ? 'Week' : 'Month' } },
                y: { title: { display: true, text: 'Count ('+granularity+')' }, beginAtZero: true },
                y2: {
                  position: 'right',
                  title: { display: true, text: 'Cumulative' },
                  beginAtZero: true,
                  grid: { drawOnChartArea: false }
                }
              },
            })}
          />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
