import { useEffect, useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { filterDatasetsByDate } from './dateFilterUtil.js';

// Chart.js registered globally

/*
  BloodAidDailyChart
  - Lit IndexedDB LogsDB.store 'logs'
  - Filtre titres contenant 'blood' ou 'first aid kit' (case-insensitive)
  - Agrège par jour (YYYY-MM-DD) → deux séries barres: bloodCount, firstAidCount
  - Ajoute une ligne (total) = blood + first aid par jour
  - Props: { logsUpdated, darkMode, chartHeight, dateFrom, dateTo, onMinDate }
*/
export default function BloodAidDailyChart({ logsUpdated, darkMode, chartHeight=380, dateFrom, dateTo, onMinDate }) {
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [labels, setLabels] = useState([]);
  const [rawCounts, setRawCounts] = useState({ blood:{}, aid:{} });
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const dbReq = indexedDB.open('LogsDB');
    dbReq.onerror = () => { if(!cancelled){ setLoading(false); } };
    dbReq.onsuccess = (e) => {
      if (cancelled) return;
      const db = e.target.result;
      if (!db.objectStoreNames.contains('logs')) { setLoading(false); return; }
      const tx = db.transaction('logs','readonly');
      const store = tx.objectStore('logs');
      let cursorReq;
      // Si un index 'title' existe on peut l'utiliser, sinon fallback full scan
      if (store.indexNames.contains('title')) {
        cursorReq = store.index('title').openCursor();
      } else {
        cursorReq = store.openCursor();
      }
      const tmpBlood = {}; const tmpAid = {};
      cursorReq.onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (!cursor) {
          const allDays = Array.from(new Set([...Object.keys(tmpBlood), ...Object.keys(tmpAid)])).sort();
          setLabels(allDays);
          setRawCounts({ blood: tmpBlood, aid: tmpAid });
          if (allDays.length && onMinDate && /^\d{4}-\d{2}-\d{\d}$/.test(allDays[0]) === false) {
            // Determine earliest day (already sorted); extract date pattern safely
            try { onMinDate(allDays[0]); } catch {}
          } else if (allDays.length && onMinDate) {
            try { onMinDate(allDays[0]); } catch {}
          }
          setLoading(false);
          return;
        }
        const val = cursor.value;
        const tsSec = Number(val.timestamp);
        if (Number.isFinite(tsSec)) {
          const title = String(val.title || val.log || '').toLowerCase();
          const day = new Date(tsSec * 1000).toISOString().slice(0,10);
          if (title.includes('blood')) {
            tmpBlood[day] = (tmpBlood[day]||0)+1;
          } else if (title.includes('first aid kit')) {
            tmpAid[day] = (tmpAid[day]||0)+1;
          }
        }
        cursor.continue();
      };
    };
    return () => { cancelled = true; };
  }, [logsUpdated]);

  const chartData = useMemo(() => {
    if (!labels.length) return { labels: [], datasets: [] };
    const bloodSeries = labels.map(d => rawCounts.blood[d]||0);
    const aidSeries = labels.map(d => rawCounts.aid[d]||0);
    // Cumulative total over time (running sum of daily counts)
    const totalSeries = [];
    let run = 0;
    for (let i = 0; i < labels.length; i++) {
      run += (bloodSeries[i] + aidSeries[i]);
      totalSeries.push(run);
    }

    let datasets = [
      ds('bar', 1, bloodSeries, { label: 'Blood', borderWidth: 1, yAxisID: 'yDaily' }),
      ds('bar', 0, aidSeries, { label: 'First Aid Kit', borderWidth: 1, yAxisID: 'yDaily' }),
      ds('line', 2, totalSeries, { label: 'Cumulative Total', tension: 0.15, pointRadius: 3, yAxisID: 'yTotal' })
    ];

    const filtered = filterDatasetsByDate(labels, datasets, dateFrom, dateTo);
    return filtered;
  }, [labels, rawCounts, dateFrom, dateTo]);

  const options = useMemo(() => themedOptions({
    responsive:true,
    maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    // Axes multiples: yDaily (empilé), yTotal (ligne cumul)
    scales:{
      yDaily:{ beginAtZero:true, title:{ display:true, text:'Daily Count' }, stacked:true, position:'left' },
      yTotal:{ beginAtZero:true, title:{ display:true, text:'Cumulative Total' }, stacked:false, position:'right', grid:{ drawOnChartArea:false } },
      x:{ ticks:{ maxRotation:0, autoSkip:true }, stacked:true }
    },
    plugins:{ legend:{ position:'top' }, tooltip:{ enabled:true } }
  }), [themedOptions]);

  return (
    <div className="my-4" style={{ maxWidth:'100%' }}>
      <h5 style={{ cursor:'pointer', userSelect:'none' }} onClick={() => setCollapsed(c=>!c)}>
        Used Medical Items
      </h5>
      {collapsed ? <div style={{ fontSize:12, opacity:0.7 }}>Hidden</div> : (
        loading ? <div style={{ fontSize:12 }}><img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} /></div> : (
          chartData.labels.length === 0 ? <div style={{ fontSize:12, opacity:0.7 }}>No matching logs</div> :
            <div style={{ height: chartHeight }}>
              <Bar data={chartData} options={options} />
            </div>
        )
      )}
    </div>
  );
}
