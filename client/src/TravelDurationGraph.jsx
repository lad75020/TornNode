import { useEffect, useState, useMemo } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { openDB } from 'idb';
import { Bar } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function TravelDurationGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  const [labels, setLabels] = useState([]); // aggregated labels
  const [values, setValues] = useState([]); // aggregated values (minutes)
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const totalDuration = useMemo(() => values.reduce((acc, v) => acc + v, 0), [values]);
  const { cumulative: cumulativeValues, average: averagePerPeriod } = useMemo(() => computeSeries(values), [values]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const db = await openDB('LogsDB');
        const storeName = 'logs';
        if (!db.objectStoreNames.contains(storeName)) {
          if (alive) {
            setLabels([]);
            setValues([]);
            setLoading(false);
          }
          return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const idx = tx.store.index('log');
        const all = await idx.getAll(6000);
        await tx.done;

        // Filter entries that have numeric data.duration, then sort by timestamp asc
        const filtered = all
          .filter(o => o && typeof o.timestamp === 'number' && o.data && typeof o.data.duration === 'number')
          .sort((a, b) => a.timestamp - b.timestamp);

        const lbls = filtered.map(o => new Date(o.timestamp * 1000).toISOString());
        const vals = filtered.map(o => Math.floor(o.data.duration / 60));

        if (alive) {
          setLabels(lbls);
          setValues(vals);
          setLoading(false);

                // Aggregate per chosen granularity
                const buckets = {}; // key -> { totalMinutes, sortKey }

                function getISOWeek(date) {
                  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
                  const dayNum = tmp.getUTCDay() || 7;
                  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
                  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
                  const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
                  return { year: tmp.getUTCFullYear(), week };
                }

                for (const o of filtered) {
                  const d = new Date(o.timestamp * 1000);
                  const minutes = Math.floor(o.data.duration / 60);
                  if (!Number.isFinite(minutes)) continue;
                  if (granularity === 'day') {
                    const key = d.toISOString().slice(0,10);
                    const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                    if (!buckets[key]) buckets[key] = { total: 0, sortKey };
                    buckets[key].total += minutes;
                  } else if (granularity === 'week') {
                    const { year, week } = getISOWeek(d);
                    const key = `${year}-W${String(week).padStart(2,'0')}`;
                    // compute start Monday
                    const simple = new Date(Date.UTC(year, 0, 4));
                    const dayOfWeek = simple.getUTCDay() || 7;
                    const week1Monday = new Date(simple);
                    week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
                    const weekStart = new Date(week1Monday);
                    weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
                    const sortKey = weekStart.getTime();
                    if (!buckets[key]) buckets[key] = { total: 0, sortKey };
                    buckets[key].total += minutes;
                  } else if (granularity === 'month') {
                    const year = d.getUTCFullYear();
                    const month = d.getUTCMonth();
                    const key = `${year}-${String(month+1).padStart(2,'0')}`;
                    const sortKey = Date.UTC(year, month, 1);
                    if (!buckets[key]) buckets[key] = { total: 0, sortKey };
                    buckets[key].total += minutes;
                  }
                }

                // Fill missing periods with 0
                let aggLabels = [];
                let aggValues = [];
                const keysCount = Object.keys(buckets).length;
                if (keysCount > 0) {
                  if (granularity === 'day') {
                    const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
                    let cursor = new Date(entries[0].sortKey);
                    const end = new Date(entries[entries.length-1].sortKey);
                    while (cursor.getTime() <= end.getTime()) {
                      const k = cursor.toISOString().slice(0,10);
                      aggLabels.push(k);
                      aggValues.push(buckets[k] ? buckets[k].total : 0);
                      cursor.setUTCDate(cursor.getUTCDate()+1);
                    }
                  } else if (granularity === 'week') {
                    const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
                    function isoLabelFromDate(monday) {
                      const { year, week } = getISOWeek(monday);
                      return `${year}-W${String(week).padStart(2,'0')}`;
                    }
                    let cursor = new Date(entries[0].sortKey);
                    const end = new Date(entries[entries.length-1].sortKey);
                    while (cursor.getTime() <= end.getTime()) {
                      const label = isoLabelFromDate(cursor);
                      aggLabels.push(label);
                      aggValues.push(buckets[label] ? buckets[label].total : 0);
                      cursor.setUTCDate(cursor.getUTCDate()+7);
                    }
                  } else if (granularity === 'month') {
                    const entries = Object.entries(buckets).map(([k,v]) => ({ k, ...v })).sort((a,b)=> a.sortKey - b.sortKey);
                    let cursor = new Date(entries[0].sortKey);
                    const end = new Date(entries[entries.length-1].sortKey);
                    while (cursor.getTime() <= end.getTime()) {
                      const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}`;
                      aggLabels.push(label);
                      aggValues.push(buckets[label] ? buckets[label].total : 0);
                      cursor.setUTCMonth(cursor.getUTCMonth()+1);
                      cursor.setUTCDate(1);
                    }
                  }
                }

                if (alive) {
                  setLabels(aggLabels);
                  setValues(aggValues);
                  setLoading(false);
                }
        }
      } catch (err) {
        console.error('TravelDurationGraph error:', err);
        if (alive) {
          setLabels([]);
          setValues([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [logsUpdated, granularity]);

  // Appliquer filtrage + onMinDate sur labels agregés (day uniquement)
  useEffect(() => {
    if (granularity !== 'day') return; // on ne filtre que les dates journalières
    if (!labels.length) return;
    // min date persistence
    if (onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
      try { onMinDate(labels[0]); } catch {}
    }
    if (!dateFrom && !dateTo) return; // rien à filtrer
    setLabels(prev => prev.filter((lab, idx) => {
      if (dateFrom && lab < dateFrom) return false;
      if (dateTo && lab > dateTo) return false;
      return true;
    }));
    setValues(prevVals => {
      const newVals = [];
      labels.forEach((lab, idx) => {
        if (dateFrom && lab < dateFrom) return;
        if (dateTo && lab > dateTo) return;
        newVals.push(prevVals[idx]);
      });
      return newVals;
    });
  }, [dateFrom, dateTo, granularity, labels.length]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(prev => !prev)}
        title="Click to show/hide chart"
      >
        Travel Time
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} />
        </div>
      ) : (
        showChart && (
          <>
            <div style={{ display: 'flex', gap: '8px', height: chartHeight }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="btn-group-vertical" role="group" aria-label="Granularity">
                  <button type="button" className={`btn btn-sm ${granularity === 'day' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('day')}>Daily</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'week' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('week')}>Weekly</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'month' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('month')}>Monthly</button>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  data={{
                    labels,
                    datasets: [
                      ds('bar', 0, values, { label: 'Durée (min)', backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }),
                      ds('line', 1, cumulativeValues, { label: 'Cumul (min)', borderColor: 'rgba(255, 159, 64, 0.9)', backgroundColor: 'rgba(255, 159, 64, 0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
                      ds('line', 2, values.map(() => averagePerPeriod), { label: 'Moyenne (min)', borderColor: 'rgba(153, 102, 255, 0.9)', backgroundColor: 'rgba(153, 102, 255, 0.3)', borderDash: [5,4], pointRadius: 0, tension: 0, fill: false }),
                    ],
                  }}
                  options={themedOptions({
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: { display: true },
                      title: { display: false },
                      tooltip: {
                        callbacks: {
                          title(items) {
                            if (!items || !items.length) return '';
                            return items[0].label;
                          },
                          label(ctx) {
                            const dsLabel = ctx.dataset.label || '';
                            return `${dsLabel}: ${ctx.parsed.y} min`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) },
                        stacked: false,
                      },
                      y: { title: { display: true, text: 'Durée (min)' }, beginAtZero: true, stacked: false },
                      y1: {
                        position: 'right',
                        title: { display: true, text: 'Cumul (min)' },
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                      },
                    },
                  })}
                />
              </div>
            </div>
            {/* Stats supprimées car info déjà visible sur le graphique (cumul + moyenne) */}
          </>
        )
      )}
    </div>
  );
}
