import { useEffect, useMemo, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { toFiniteNumber } from './financeAnalytics.js';
import { bucketChartData, chartBuckets, notifyMinDate, validTimestamp } from './activityChartUtils.js';

import { Bar } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';

function getLastNDaysRange(days) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Math.max(1, Number(days) || 1) - 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default function LogsGraph({ token, onAuth, logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [rows, setRows] = useState([]);
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const [zoom30Days, setZoom30Days] = useState(false);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const all = await getLogsByLogId(5410);
        if (!cancelled) setRows(Array.isArray(all) ? all.filter(validTimestamp) : []);
      } catch {
        if (!cancelled) { setRows([]); setError('Activity logs are unavailable.'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [logsUpdated]);

  const buckets = useMemo(() => chartBuckets(rows, { granularity, getTimestamp: row => row.timestamp, getValues: () => [1] }), [rows, granularity]);
  const last30 = getLastNDaysRange(30);
  const effectiveFrom = zoom30Days ? last30.from : dateFrom;
  const effectiveTo = zoom30Days ? last30.to : dateTo;
  const filtered = useMemo(() => bucketChartData(buckets, [{ label: 'Count', data: buckets.map(bucket => bucket.sums[0]) }], effectiveFrom, effectiveTo, granularity), [buckets, effectiveFrom, effectiveTo, granularity]);
  useEffect(() => { if (granularity === 'day') notifyMinDate(buckets, onMinDate); }, [buckets, granularity, onMinDate]);

  // Derived series: cumulative + average line
  const counts = filtered.datasets[0]?.data || [];
  const filteredSeries = computeSeries(counts);
  const timeframeTotalLogs = counts.reduce((acc, v) => acc + (toFiniteNumber(v) ?? 0), 0);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
  Revives per {granularity}
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : error ? <div className="text-muted">{error}</div> : !counts.length ? <div className="text-muted">No matching activity logs.</div> : (
        showChart && (
          <>
            <div style={{ display: 'flex', gap: '8px', height: chartHeight }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="btn-group-vertical" role="group" aria-label="Granularity">
                  <button type="button" className={`btn btn-sm ${granularity === 'day' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('day')}>Daily</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'week' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('week')}>Weekly</button>
                  <button type="button" className={`btn btn-sm ${granularity === 'month' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('month')}>Monthly</button>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${zoom30Days ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => {
                    const next = !zoom30Days;
                    setZoom30Days(next);
                    if (next && granularity !== 'day') setGranularity('day');
                  }}
                >
                  30 days
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  data={{
                    labels: filtered.labels,
                    datasets: [
                      ds('bar', 0, counts, { label: 'Count', backgroundColor: 'rgba(75,192,192,0.6)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1 }),
                      ds('line', 1, filteredSeries.cumulative, { label: 'Cumul', borderColor: 'rgba(255, 159, 64, 0.9)', backgroundColor: 'rgba(255, 159, 64, 0.3)', yAxisID: 'y1', pointRadius: 2, tension: 0.15, fill: false }),
                      ds('line', 2, counts.map(() => filteredSeries.average), { label: 'Moyenne', borderColor: 'rgba(153, 102, 255, 0.9)', backgroundColor: 'rgba(153, 102, 255, 0.3)', borderDash: [6,4], pointRadius: 0, tension: 0, fill: false }),
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
                          label(ctx) {
                            const dsLabel = ctx.dataset.label || '';
                            return `${dsLabel}: ${ctx.parsed.y}`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: { title: { display: true, text: granularity.charAt(0).toUpperCase() + granularity.slice(1) } },
                      y: { title: { display: true, text: 'Count' }, beginAtZero: true },
                      y1: { position: 'right', title: { display: true, text: 'Cumul' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                    },
                  })}
                />
              </div>
            </div>
            <InlineStat
              id="logs-graph-timeframe-total"
              label="Total"
              value={timeframeTotalLogs}
              containerStyle={{ margin: '8px 0 0 0', maxWidth: 340 }}
              labelStyle={{ fontSize: 12 }}
              inputStyle={{ fontSize: 13, fontWeight: 600, maxWidth: 120, padding: '2px 8px', height: 30 }}
            />
          </>
        )
      )}
    </div>
  );
}
