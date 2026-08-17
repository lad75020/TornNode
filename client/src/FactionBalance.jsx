import { useEffect, useMemo, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Line } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';
import { toFiniteNumber, toUnixDate } from './financeAnalytics.js';

function inRange(point, dateFrom, dateTo) {
  const day = new Date(point.x).toISOString().slice(0, 10);
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
}

export default function FactionBalanceChart({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getLogsByLogId(6738), getLogsByLogId(6795)])
      .then(([first, second]) => {
        if (cancelled) return;
        const normalized = [...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])]
          .map(row => {
            const date = toUnixDate(row?.timestamp);
            const balance = toFiniteNumber(row?.data?.balance_after);
            return date && balance !== null ? { x: date.getTime(), y: balance } : null;
          })
          .filter(Boolean)
          .sort((left, right) => left.x - right.x || left.y - right.y);
        setPoints(normalized);
        setLoading(false);
        if (normalized.length && typeof onMinDate === 'function') {
          try { onMinDate(new Date(normalized[0].x).toISOString().slice(0, 10)); } catch (_) {}
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPoints([]);
        setError('Faction balance data could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const displayedPoints = useMemo(
    () => points.filter(point => inRange(point, dateFrom, dateTo)),
    [points, dateFrom, dateTo],
  );
  const totalIncreases = useMemo(() => points.reduce((total, point, index) => {
    if (index === 0) return total;
    const increase = point.y - points[index - 1].y;
    return increase > 0 ? total + increase : total;
  }, 0), [points]);
  const chartData = useMemo(() => ({
    datasets: [ds('line', 0, displayedPoints, { label: 'Balance', pointRadius: 3, showLine: true, fill: false, tension: 0.2 })],
  }), [displayedPoints, ds]);

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Faction balance</h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || displayedPoints.length === 0 ? (
        <div role="status">{error || 'No faction balance data available for this range.'}</div>
      ) : showChart ? (
        <>
          <div style={{ height: chartHeight }}>
            <Line data={chartData} options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { title: { display: true, text: 'Date' }, type: 'time', time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' }, tooltipFormat: 'yyyy-MM-dd' } },
                y: { title: { display: true, text: 'Balance' }, beginAtZero: true },
              },
            })} />
          </div>
          <InlineStat id="factionEarnedTotal" label="Earned Total:" value={totalIncreases} />
        </>
      ) : null}
    </div>
  );
}
