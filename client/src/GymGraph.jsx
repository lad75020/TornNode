import { useEffect, useMemo, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

const SERIES = [
  { id: 5302, field: 'speed_after', label: 'Speed', color: 'rgba(255, 165, 0, 0.9)' },
  { id: 5303, field: 'dexterity_after', label: 'Dexterity', color: 'rgba(0, 123, 255, 0.9)' },
  { id: 5300, field: 'strength_after', label: 'Strength', color: 'rgba(40, 167, 69, 0.9)' },
  { id: 5301, field: 'defense_after', label: 'Defense', color: 'rgba(220, 53, 69, 0.9)' },
];

function toTimestampMs(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const milliseconds = seconds * 1000;
  return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
}

function inDateRange(timestamp, dateFrom, dateTo) {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  if (dateFrom && dateTo && dateFrom > dateTo) return false;
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
}

export default function GymGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [series, setSeries] = useState(() => SERIES.map(() => []));
  const [status, setStatus] = useState('loading');
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      const loaded = await Promise.all(SERIES.map(async ({ id, field }) => {
        try {
          const entries = await getLogsByLogId(id);
          return entries
            .map(entry => {
              const timestamp = toTimestampMs(entry?.timestamp);
              const value = entry?.data?.[field];
              if (timestamp === null || typeof value !== 'number' || !Number.isFinite(value)) return null;
              return { x: timestamp, y: value };
            })
            .filter(Boolean)
            .sort((left, right) => left.x - right.x);
        } catch (_) {
          return [];
        }
      }));
      if (cancelled) return;
      setSeries(loaded);
      const firstPoint = loaded.flat().sort((left, right) => left.x - right.x)[0];
      if (firstPoint && onMinDate) {
        try { onMinDate(new Date(firstPoint.x).toISOString().slice(0, 10)); } catch (_) {}
      }
      setStatus(loaded.some(points => points.length) ? 'ready' : 'empty');
    })().catch(() => {
      if (!cancelled) {
        setSeries(SERIES.map(() => []));
        setStatus('error');
      }
    });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const chartData = useMemo(() => ({
    datasets: SERIES.map(({ label, color }, index) => ds('line', index, series[index].filter(point => inDateRange(point.x, dateFrom, dateTo)), {
      label,
      borderColor: color,
      backgroundColor: color.replace('0.9', '0.3'),
      pointRadius: 3,
      showLine: true,
      fill: false,
      tension: 0.2,
    })),
  }), [series, dateFrom, dateTo, ds]);

  const visiblePointCount = chartData.datasets.reduce((total, dataset) => total + dataset.data.length, 0);

  return (
    <div>
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(prev => !prev)}
        title="Click to show/hide chart"
      >
        Battle stats
      </h5>
      {status === 'loading' ? (
        <div><img src="/images/loader.gif" alt="Loading battle statistics" style={{ maxWidth: '80px' }} /></div>
      ) : status === 'error' ? (
        <div role="alert">Battle statistics could not be loaded.</div>
      ) : visiblePointCount === 0 ? (
        <div role="status">No battle data is available for this date range.</div>
      ) : showChart ? (
        <div style={{ height: chartHeight }}>
          <Line
            data={chartData}
            options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PPpp' }, adapters: {}, title: { display: true, text: 'Date' }, ticks: { maxRotation: 0, autoSkip: true } },
                y: { title: { display: true, text: 'Value' }, beginAtZero: true },
              },
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
