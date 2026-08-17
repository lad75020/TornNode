import { useEffect, useMemo, useRef, useState } from 'react';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';

function normalizeSnapshot(value) {
  if (!value || value.date == null || typeof value.racingskill !== 'number' || !Number.isFinite(value.racingskill)) return null;
  const timestamp = new Date(value.date).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return { day: new Date(timestamp).toISOString().slice(0, 10), t: new Date(timestamp), v: value.racingskill };
}

function inDateRange(day, dateFrom, dateTo) {
  if (dateFrom && dateTo && dateFrom > dateTo) return false;
  return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
}

export default function RacingSkillGraph({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [points, setPoints] = useState([]);
  const [status, setStatus] = useState('loading');
  const requestedSocketRef = useRef(null);
  const lastProcessedIndexRef = useRef(0);
  const pointsRef = useRef(new Map());
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    if (!Array.isArray(wsMessages) || wsMessages.length === 0) return undefined;
    if (wsMessages.length < lastProcessedIndexRef.current) lastProcessedIndexRef.current = 0;
    let changed = false;
    let sawResponse = false;
    let sawError = false;

    for (let index = lastProcessedIndexRef.current; index < wsMessages.length; index += 1) {
      const raw = wsMessages[index];
      if (typeof raw !== 'string' || !raw.startsWith('{')) continue;
      let message;
      try { message = JSON.parse(raw); } catch (_) { continue; }
      if (!message || message.type !== 'racingskill') continue;
      sawResponse = true;
      if (message.error) {
        sawError = true;
        continue;
      }
      if (!Array.isArray(message.data)) continue;
      for (const rawPoint of message.data) {
        const point = normalizeSnapshot(rawPoint);
        if (!point) continue;
        pointsRef.current.set(point.day, point);
        changed = true;
      }
    }
    lastProcessedIndexRef.current = wsMessages.length;

    if (sawResponse) {
      const nextPoints = [...pointsRef.current.values()].sort((left, right) => left.t - right.t);
      setPoints(nextPoints);
      setStatus(sawError && nextPoints.length === 0 ? 'error' : nextPoints.length ? 'ready' : 'empty');
    }
    if (changed && onMinDate) {
      const first = [...pointsRef.current.values()].sort((left, right) => left.t - right.t)[0];
      try { onMinDate(first.day); } catch (_) {}
    }
    return undefined;
  }, [wsMessages, onMinDate]);

  useEffect(() => {
    const socket = wsRef?.current;
    if (!socket || socket.readyState !== 1 || requestedSocketRef.current === socket) return;
    requestedSocketRef.current = socket;
    try {
      sendWs?.('racingskill');
    } catch (_) {
      setStatus('error');
    }
  }, [wsRef, wsMessages, sendWs]);

  const visiblePoints = useMemo(
    () => points.filter(point => inDateRange(point.day, dateFrom, dateTo)),
    [points, dateFrom, dateTo],
  );
  const labels = visiblePoints.map(point => point.t);
  const dataValues = visiblePoints.map(point => point.v);
  const lineColor = darkMode ? 'rgba(130,180,255,0.9)' : 'rgba(54,162,235,0.9)';
  const fillColor = darkMode ? 'rgba(130,180,255,0.25)' : 'rgba(54,162,235,0.25)';
  const data = {
    labels,
    datasets: [ds('line', 0, dataValues, { label: 'Racing Skill', pointRadius: 2, tension: 0.2, fill: true, yAxisID: 'y', borderColor: lineColor, backgroundColor: fillColor })],
  };
  const options = themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { type: 'time', time: { unit: 'day' }, ticks: { maxRotation: 0 } },
      y: { title: { display: true, text: 'Skill' }, beginAtZero: true },
    },
    plugins: { legend: { display: true }, tooltip: { enabled: true } },
  });

  return (
    <div className="card" style={{ height: chartHeight, display: 'flex', flexDirection: 'column', marginBottom: 0, ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0', border: '1px solid #2a2a2a' } : {}) }}>
      <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.75rem 0.75rem 0.5rem', ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0' } : {}) }}>
        <h5 className="card-title" style={{ marginBottom: '0.5rem', fontSize: '1rem', ...(darkMode ? { background: '#222', color: '#e0e0e0' } : {}) }}>Racing Skill</h5>
        {status === 'loading' ? (
          <div role="status">Loading racing skill…</div>
        ) : status === 'error' ? (
          <div role="alert">Racing skill could not be loaded.</div>
        ) : visiblePoints.length === 0 ? (
          <div role="status">No racing skill data is available for this date range.</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}><Line data={data} options={options} /></div>
        )}
      </div>
    </div>
  );
}
