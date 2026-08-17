import { useEffect, useMemo, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { Scatter } from 'react-chartjs-2';

const colorMap = new Map();
function toTimestampMs(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const milliseconds = seconds * 1000;
  return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
}

function getColor(crime) {
  if (!colorMap.has(crime)) colorMap.set(crime, `hsl(${(colorMap.size * 47) % 360}, 70%, 55%)`);
  return colorMap.get(crime);
}

function inDateRange(timestamp, dateFrom, dateTo) {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  if (dateFrom && dateTo && dateFrom > dateTo) return false;
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
}

export default function CrimeScatterGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [pointsByCrime, setPointsByCrime] = useState({});
  const [status, setStatus] = useState('loading');
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      let entries = [];
      try { entries = await getLogsByLogId(9005); } catch (_) { entries = []; }
      const grouped = {};
      for (const entry of entries) {
        const timestamp = toTimestampMs(entry?.timestamp);
        const skill = entry?.data?.skill_level;
        if (timestamp === null || typeof skill !== 'number' || !Number.isFinite(skill)) continue;
        const rawCrime = typeof entry?.data?.crime === 'string' ? entry.data.crime.trim() : '';
        const crime = rawCrime || 'unknown';
        if (!grouped[crime]) grouped[crime] = [];
        grouped[crime].push({ x: timestamp, y: skill });
      }
      Object.values(grouped).forEach(points => points.sort((left, right) => left.x - right.x));
      if (cancelled) return;
      setPointsByCrime(grouped);
      const earliest = Object.values(grouped).flat().sort((left, right) => left.x - right.x)[0];
      if (earliest && onMinDate) {
        try { onMinDate(new Date(earliest.x).toISOString().slice(0, 10)); } catch (_) {}
      }
      setStatus(Object.keys(grouped).length ? 'ready' : 'empty');
    })().catch(() => {
      if (!cancelled) {
        setPointsByCrime({});
        setStatus('error');
      }
    });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const chartData = useMemo(() => ({
    datasets: Object.entries(pointsByCrime).map(([crime, points], index) => {
      const color = getColor(crime);
      return ds('scatter', index, points.filter(point => inDateRange(point.x, dateFrom, dateTo)), {
        label: crime,
        backgroundColor: color,
        borderColor: color,
        pointRadius: 4,
        showLine: true,
        borderWidth: 1.5,
        tension: 0.15,
        spanGaps: false,
      });
    }),
  }), [pointsByCrime, dateFrom, dateTo, ds]);

  const visiblePointCount = chartData.datasets.reduce((total, dataset) => total + dataset.data.length, 0);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(prev => !prev)}
        title="Click to show/hide chart"
      >
        Crime Skill Levels
      </h5>
      {status === 'loading' ? (
        <div><img src="/images/loader.gif" alt="Loading crime skills" style={{ maxWidth: '80px' }} /></div>
      ) : status === 'error' ? (
        <div role="alert">Crime skills could not be loaded.</div>
      ) : visiblePointCount === 0 ? (
        <div role="status">No crime skill data is available for this date range.</div>
      ) : showChart ? (
        <div style={{ height: chartHeight }}>
          <Scatter
            data={chartData}
            options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { title: { display: true, text: 'Date' }, type: 'time', time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' }, tooltipFormat: 'yyyy-MM-dd' }, ticks: { source: 'auto', maxRotation: 0, autoSkip: true } },
                y: { title: { display: true, text: 'Crime skills' }, beginAtZero: true },
              },
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
