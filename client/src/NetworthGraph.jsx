import { useEffect, useMemo, useRef, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { Line } from 'react-chartjs-2';
import { filterBuckets, toFiniteNumber } from './financeAnalytics.js';

function parseMessage(message) {
  if (typeof message === 'string') {
    try { return JSON.parse(message); } catch (_) { return null; }
  }
  return message && typeof message === 'object' ? message : null;
}

function normalizeSnapshots(value) {
  if (!Array.isArray(value)) return [];
  const snapshots = value
    .map(item => {
      const date = new Date(item?.date);
      const numericValue = toFiniteNumber(item?.value);
      return Number.isNaN(date.getTime()) || numericValue === null
        ? null
        : { date: date.toISOString(), value: numericValue };
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date) || left.value - right.value);
  const unique = [];
  for (const snapshot of snapshots) {
    if (unique.length === 0 || unique[unique.length - 1].date !== snapshot.date) unique.push(snapshot);
  }
  return unique;
}

export default function NetworthGraph({ darkMode, wsMessages = [], sendWs, dateFrom, dateTo, onMinDate }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const requestedRef = useRef(false);
  const processedMessageRef = useRef(null);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    if (requestedRef.current || typeof sendWs !== 'function') return;
    requestedRef.current = true;
    setLoading(true);
    try { sendWs('getNetworth'); } catch (_) {
      setError('Networth could not be loaded. Please retry.');
      setLoading(false);
    }
  }, [sendWs]);

  useEffect(() => {
    for (let index = wsMessages.length - 1; index >= 0; index -= 1) {
      const parsed = parseMessage(wsMessages[index]);
      if (!parsed || parsed.type !== 'getNetworth') continue;
      const signature = JSON.stringify(parsed);
      if (processedMessageRef.current === signature) return;
      processedMessageRef.current = signature;
      if (parsed.error) {
        setSnapshots([]);
        setError(String(parsed.error));
        setLoading(false);
        return;
      }
      const normalized = normalizeSnapshots(parsed.data);
      setSnapshots(normalized);
      setError(null);
      setLoading(false);
      if (normalized.length && typeof onMinDate === 'function') {
        try { onMinDate(normalized[0].date.slice(0, 10)); } catch (_) {}
      }
      return;
    }
  }, [wsMessages, onMinDate]);

  const filtered = useMemo(() => filterBuckets(
    snapshots.map(snapshot => snapshot.date.slice(0, 10)),
    [{ label: 'Networth', data: snapshots.map(snapshot => snapshot.value) }],
    dateFrom,
    dateTo,
    'day',
  ), [snapshots, dateFrom, dateTo]);

  const chartData = useMemo(() => ({
    labels: filtered.labels,
    datasets: [ds('line', 0, filtered.datasets[0]?.data || [], {
      label: 'Networth', pointRadius: 3, showLine: true, fill: false, tension: 0.2,
    })],
  }), [ds, filtered]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(previous => !previous)}
        title="Click to show/hide chart"
      >
        Networth by Date
      </h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || filtered.labels.length === 0 ? (
        <div role="status">{error || 'No networth data available for this range.'}</div>
      ) : showChart ? (
        <div style={{ height: 400 }}>
          <Line
            data={chartData}
            options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { title: { display: true, text: 'Date' }, type: 'category' },
                y: { title: { display: true, text: 'Networth' }, beginAtZero: true },
              },
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
