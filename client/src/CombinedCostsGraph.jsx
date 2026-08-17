import { useEffect, useMemo, useState } from 'react';
import JsonPreview from './JsonPreview.jsx';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { aggregateRows, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

const SOURCES = [
  { id: 1103, series: 'A', field: 'cost' },
  { id: 1104, series: 'B', field: 'cost' },
  { id: 1112, series: 'A', field: 'cost_total' },
  { id: 1113, series: 'B', field: 'cost_total' },
];

export default function CombinedCostsGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [granularity, setGranularity] = useState('daily');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const [modal, setModal] = useState({ open: false, label: null, payload: null });
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(SOURCES.map(source => getLogsByLogId(source.id)))
      .then(results => {
        if (cancelled) return;
        const normalized = [];
        results.forEach((entries, sourceIndex) => {
          const source = SOURCES[sourceIndex];
          for (const row of Array.isArray(entries) ? entries : []) {
            const date = toUnixDate(row?.timestamp);
            const value = toFiniteNumber(row?.data?.[source.field]);
            if (!date || value === null) continue;
            normalized.push({ timestamp: row.timestamp, series: source.series, value, source: row });
          }
        });
        normalized.sort((left, right) => left.timestamp - right.timestamp);
        setRows(normalized);
        setLoading(false);
        if (normalized.length && typeof onMinDate === 'function') {
          try { onMinDate(new Date(normalized[0].timestamp * 1000).toISOString().slice(0, 10)); } catch (_) {}
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setError('Market cost data could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const displayed = useMemo(() => {
    const inRange = rows.filter(row => {
      const day = new Date(row.timestamp * 1000).toISOString().slice(0, 10);
      return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
    });
    const bucketRows = inRange.map(row => ({
      timestamp: row.timestamp,
      seriesA: row.series === 'A' ? row.value : null,
      seriesB: row.series === 'B' ? row.value : null,
      source: row.source,
    }));
    const buckets = aggregateRows(bucketRows, {
      granularity: granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month',
      getTimestamp: row => row.timestamp,
      getValues: row => [row.seriesA, row.seriesB],
      getItem: row => row.source,
    });
    return {
      labels: buckets.map(bucket => bucket.label),
      seriesA: buckets.map(bucket => bucket.sums[0]),
      seriesB: buckets.map(bucket => bucket.sums[1]),
      items: Object.fromEntries(buckets.map(bucket => [bucket.label, bucket.items])),
    };
  }, [rows, granularity, dateFrom, dateTo]);

  const totals = useMemo(() => ({
    A: displayed.seriesA.reduce((sum, value) => sum + value, 0),
    B: displayed.seriesB.reduce((sum, value) => sum + value, 0),
  }), [displayed]);
  const hasPositiveData = displayed.seriesA.some(value => value > 0) || displayed.seriesB.some(value => value > 0);

  const openModal = (event, elements, chart) => {
    if (!elements?.length) return;
    const label = chart?.data?.labels?.[elements[0].index];
    if (!label) return;
    const purchase = displayed.seriesA[elements[0].index] || 0;
    const sales = displayed.seriesB[elements[0].index] || 0;
    setModal({
      open: true,
      label,
      payload: {
        granularity,
        bucket: label,
        purchase,
        sales,
        ratio: purchase ? sales / purchase : null,
        totals,
        percentOfTotalPurchases: totals.A ? purchase / totals.A : 0,
        percentOfTotalSales: totals.B ? sales / totals.B : 0,
        items: displayed.items[label] || [],
      },
    });
  };

  const closeModal = () => setModal({ open: false, label: null, payload: null });

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Item Market Purchases &amp; Sales – {granularity}</h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || !hasPositiveData ? (
        <div role="status">{error || 'No market cost data available for this range.'}</div>
      ) : showChart ? (
        <>
          <div style={{ position: 'relative', height: chartHeight }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '4px', zIndex: 5 }}>
              {['daily', 'weekly', 'monthly'].map(value => (
                <button key={value} onClick={() => setGranularity(value)} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', background: granularity === value ? (darkMode ? '#555' : '#ddd') : (darkMode ? '#333' : '#f5f5f5'), color: darkMode ? '#fff' : '#222', border: `1px solid ${darkMode ? '#777' : '#ccc'}`, borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '6px 4px' }}>{value}</button>
              ))}
            </div>
            <div style={{ height: '100%', marginLeft: 40 }}>
              <Bar
                data={{ labels: displayed.labels, datasets: [
                  ds('bar', 0, displayed.seriesA.map(value => value > 0 ? value : null), { label: 'Purchases', borderWidth: 1 }),
                  ds('bar', 1, displayed.seriesB.map(value => value > 0 ? value : null), { label: 'Sales', borderWidth: 1 }),
                ] }}
                options={themedOptions({
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: openModal,
                  plugins: { legend: { display: true }, title: { display: false } },
                  scales: {
                    x: { title: { display: true, text: granularity === 'daily' ? 'Day' : granularity === 'weekly' ? 'Week' : 'Month' } },
                    y: { type: 'logarithmic', title: { display: true, text: 'Sum cost (log)' }, min: 1 },
                  },
                  interaction: { intersect: false, mode: 'index' },
                })}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>Total Purchases: {totals.A.toLocaleString()} | Total Sales: {totals.B.toLocaleString()}</div>
        </>
      ) : null}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2100, display: 'flex', flexDirection: 'column' }} onClick={closeModal}>
          <div style={{ margin: '40px auto', background: '#fff', color: '#222', padding: '16px 20px', borderRadius: 8, maxWidth: '90%', maxHeight: '80%', overflow: 'auto' }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><h6 style={{ margin: 0 }}>Bucket {modal.label}</h6><button className="btn btn-sm btn-secondary" onClick={closeModal}>Close</button></div>
            <JsonPreview value={modal.payload} style={{ fontSize: 14 }} />
          </div>
        </div>
      )}
    </div>
  );
}
