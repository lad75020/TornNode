import { useEffect, useState, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { getLogsByLogId } from './dbLayer.js';
import useChartTheme from './useChartTheme.js';
import { CHART_HEIGHT } from './chartConstants.js';
import 'chartjs-adapter-date-fns';

function normalizePosition(entry) {
  const seconds = Number(entry?.timestamp);
  const timestamp = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : NaN;
  const position = entry?.data?.position;
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()) || typeof position !== 'string' || !/^\d/.test(position)) return null;
  const value = Number.parseInt(position[0], 10);
  return Number.isFinite(value) ? { x: timestamp, y: value } : null;
}

function inDateRange(point, dateFrom, dateTo) {
  const day = new Date(point.x).toISOString().slice(0, 10);
  if (dateFrom && dateTo && dateFrom > dateTo) return false;
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
}

function aggregate(points, granularity) {
  const buckets = new Map();
  const bucketKey = timestamp => {
    const date = new Date(timestamp);
    if (granularity === 'day') date.setUTCHours(0, 0, 0, 0);
    else if (granularity === 'week') {
      const day = date.getUTCDay();
      date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
      date.setUTCHours(0, 0, 0, 0);
    } else {
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
    }
    return date.getTime();
  };

  for (const point of points) {
    const key = bucketKey(point.x);
    const bucket = buckets.get(key) || { sum: 0, count: 0 };
    bucket.sum += point.y;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const avg = [...buckets.entries()]
    .map(([x, bucket]) => ({ x, y: bucket.sum / bucket.count }))
    .sort((left, right) => left.x - right.x);
  const counts = [...buckets.entries()]
    .map(([x, bucket]) => ({ x, y: bucket.count }))
    .sort((left, right) => left.x - right.x);
  return { avg, counts };
}

export default function RacingPositionGraph({ logsUpdated, darkMode, chartHeight = CHART_HEIGHT, dateFrom, dateTo, onMinDate }) {
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState('loading');
  const [show, setShow] = useState(true);
  const [granularity, setGranularity] = useState('week');
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      let entries = [];
      try { entries = await getLogsByLogId(8731); } catch (_) { entries = []; }
      const normalized = entries.map(normalizePosition).filter(Boolean).sort((left, right) => left.x - right.x);
      if (cancelled) return;
      setPoints(normalized);
      if (normalized.length && onMinDate) {
        try { onMinDate(new Date(normalized[0].x).toISOString().slice(0, 10)); } catch (_) {}
      }
      setStatus(normalized.length ? 'ready' : 'empty');
    })().catch(() => {
      if (!cancelled) {
        setPoints([]);
        setStatus('error');
      }
    });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const aggregated = useMemo(() => {
    const filtered = points.filter(point => inDateRange(point, dateFrom, dateTo));
    return aggregate(filtered, granularity);
  }, [points, granularity, dateFrom, dateTo]);

  const data = useMemo(() => ({
    datasets: [
      ds('bar', 0, aggregated.avg, { label: `Avg Position (${granularity})`, parsing: false, barPercentage: 0.9, categoryPercentage: 0.9, yAxisID: 'y' }),
      ds('bar', 1, aggregated.counts, { label: `Count (${granularity})`, parsing: false, barPercentage: 0.6, categoryPercentage: 0.6, yAxisID: 'yCount' }),
    ],
  }), [aggregated, granularity, ds]);

  const options = useMemo(() => themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    scales: {
      x: { type: 'time', time: { tooltipFormat: 'yyyy-MM-dd HH:mm', displayFormats: { hour: 'HH:mm', day: 'yyyy-MM-dd' } }, title: { display: true, text: 'Timestamp' } },
      y: { title: { display: true, text: 'Avg position (first digit)' }, beginAtZero: false },
      yCount: { position: 'right', title: { display: true, text: 'Count' }, beginAtZero: true, grid: { drawOnChartArea: false } },
    },
    plugins: {
      legend: { display: true },
      tooltip: {
        callbacks: {
          title: items => items.length ? new Date(items[0].parsed.x).toLocaleString() : '',
          label: context => context.dataset.yAxisID === 'y'
            ? `Avg Position: ${Number(context.parsed.y).toFixed(2)}`
            : `Count: ${context.parsed.y}`,
        },
      },
    },
  }), [themedOptions]);

  const hasVisiblePoints = aggregated.avg.length > 0;

  return (
    <div className="my-4" style={{ height: chartHeight, display: 'flex', flexDirection: 'column' }}>
      <h5 style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 8 }} title="Show or hide" onClick={() => setShow(value => !value)}>
        Racing Position – Avg &amp; Count ({aggregated.avg.length} {granularity}{aggregated.avg.length > 1 ? 's' : ''}, {points.length} raw pts)
      </h5>
      {status === 'loading' ? (
        <div>Loading…</div>
      ) : status === 'error' ? (
        <div role="alert">Racing position data could not be loaded.</div>
      ) : !hasVisiblePoints ? (
        <div role="status">No racing position data is available for this date range.</div>
      ) : show ? (
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: 4, zIndex: 5 }}>
            {['day', 'week', 'month'].map(value => (
              <button
                key={value}
                onClick={() => setGranularity(value)}
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  background: granularity === value ? (darkMode ? '#556' : '#ddd') : (darkMode ? '#333' : '#f6f6f6'),
                  color: darkMode ? '#fff' : '#222',
                  border: `1px solid ${darkMode ? '#777' : '#ccc'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '6px 4px',
                }}
              >{value}</button>
            ))}
          </div>
          <div style={{ marginLeft: 40, height: '100%' }}><Bar data={data} options={options} /></div>
        </div>
      ) : null}
    </div>
  );
}
