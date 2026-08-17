import { useEffect, useMemo, useRef, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { Line } from 'react-chartjs-2';

const START_EPOCH = 1716574650;
const DB_NAME = 'WorkStatsDB';
const STORE_NAME = 'work_stats';
const DAILY_LABEL = /^\d{4}-\d{2}-\d{2}$/;
const STAT_FIELDS = ['manual', 'intelligence', 'endurance'];

function normalizeDay(value) {
  let day = '';
  try {
    day = value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === 'string' ? value.slice(0, 10) : '';
  } catch (_) {
    return null;
  }
  if (!DAILY_LABEL.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

export function normalizeWorkStat(raw) {
  const date = normalizeDay(raw?.date);
  if (!date) return null;
  const values = {};
  let hasValue = false;
  for (const field of STAT_FIELDS) {
    if (raw[field] == null) {
      values[field] = 0;
      continue;
    }
    const value = Number(raw[field]);
    if (!Number.isFinite(value)) return null;
    values[field] = value;
    hasValue = true;
  }
  if (!hasValue) return null;
  return { date, ...values, ...(raw.abs === true ? { abs: true } : {}) };
}

export function buildCumulativeWorkData(stats, dateFrom, dateTo) {
  const sorted = (Array.isArray(stats) ? stats : [])
    .map(normalizeWorkStat)
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
  let manualSum = 0;
  let intelligenceSum = 0;
  let enduranceSum = 0;
  const rows = [];

  for (const stat of sorted) {
    if (stat.abs) {
      manualSum = stat.manual;
      intelligenceSum = stat.intelligence;
      enduranceSum = stat.endurance;
    } else {
      manualSum += stat.manual;
      intelligenceSum += stat.intelligence;
      enduranceSum += stat.endurance;
    }
    if (dateFrom && dateTo && dateFrom > dateTo) continue;
    if (dateFrom && stat.date < dateFrom) continue;
    if (dateTo && stat.date > dateTo) continue;
    rows.push({ date: stat.date, manual: manualSum, intelligence: intelligenceSum, endurance: enduranceSum });
  }

  return {
    minDate: sorted[0]?.date || null,
    labels: rows.map(row => row.date),
    manual: rows.map(row => row.manual),
    intelligence: rows.map(row => row.intelligence),
    endurance: rows.map(row => row.endurance),
  };
}

function openWorkStatsDB() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'date' });
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error || new Error('Work statistics cache unavailable'));
  });
}

function readAllWorkStats(db) {
  return new Promise(resolve => {
    try {
      if (!db.objectStoreNames.contains(STORE_NAME)) return resolve([]);
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
}

async function persistWorkStats(db, stats) {
  if (!db || !stats.length) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const stat of stats) await tx.store.put(stat);
  await tx.done;
}

export default function WorkStatsGraph({ logsUpdated, darkMode, chartHeight = 400, wsMessages = [], sendWs, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [status, setStatus] = useState('loading');
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  const statsMapRef = useRef(new Map());
  const requestSentRef = useRef(false);
  const processedRangeRef = useRef(null);
  const lastSentRangeRef = useRef(null);
  const lastRequestIdRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef(null);
  const lastProcessedIndexRef = useRef(0);

  function buildAndSetChart(stats, updateStatus = true) {
    const view = buildCumulativeWorkData(stats, dateFrom, dateTo);
    if (view.minDate && onMinDate) {
      try { onMinDate(view.minDate); } catch (_) {}
    }
    setChartData({
      labels: view.labels,
      datasets: [
        ds('line', 0, view.manual, { label: 'Manual', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
        ds('line', 1, view.intelligence, { label: 'Intelligence', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
        ds('line', 2, view.endurance, { label: 'Endurance', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
      ],
    });
    if (updateStatus) setStatus(view.labels.length ? 'ready' : 'empty');
  }

  useEffect(() => {
    if (wsMessages.length < lastProcessedIndexRef.current) lastProcessedIndexRef.current = 0;
  }, [wsMessages.length]);

  useEffect(() => {
    let cancelled = false;
    requestSentRef.current = false;
    processedRangeRef.current = null;
    retryRef.current = 0;
    clearTimeout(retryTimerRef.current);
    setStatus('loading');

    const sendRange = () => {
      if (cancelled || requestSentRef.current || typeof sendWs !== 'function') return false;
      const to = Math.floor(Date.now() / 1000);
      const rangeKey = `${START_EPOCH}|${to}`;
      const requestId = `company-train-range-${Date.now()}-${retryRef.current}`;
      lastSentRangeRef.current = rangeKey;
      lastRequestIdRef.current = requestId;
      try {
        sendWs(JSON.stringify({ type: 'companyTrainRange', from: START_EPOCH, to, requestId }));
        requestSentRef.current = true;
        return true;
      } catch (_) {
        requestSentRef.current = false;
        return false;
      }
    };

    const scheduleRetry = () => {
      clearTimeout(retryTimerRef.current);
      if (cancelled || retryRef.current >= 3 || processedRangeRef.current === lastSentRangeRef.current) return;
      retryTimerRef.current = setTimeout(() => {
        if (cancelled || processedRangeRef.current === lastSentRangeRef.current) return;
        retryRef.current += 1;
        requestSentRef.current = false;
        sendRange();
        if (retryRef.current >= 3) {
          setStatus(statsMapRef.current.size ? 'ready' : 'error');
        } else {
          scheduleRetry();
        }
      }, 2000 * Math.max(1, retryRef.current + 1));
    };

    (async () => {
      let db = null;
      let cached = [];
      try {
        db = await openWorkStatsDB();
        cached = (await readAllWorkStats(db)).map(normalizeWorkStat).filter(Boolean);
      } catch (_) {
        cached = [];
      } finally {
        try { db?.close(); } catch (_) {}
      }
      if (cancelled) return;

      statsMapRef.current = new Map(cached.map(stat => [stat.date, stat]));
      buildAndSetChart(cached, false);
      if (cached.length) setStatus('ready');

      if (!sendRange()) {
        if (!cached.length) setStatus(typeof sendWs === 'function' ? 'error' : 'empty');
        return;
      }
      if (!cached.length) scheduleRetry();
    })().catch(() => {
      if (!cancelled) setStatus(statsMapRef.current.size ? 'ready' : 'error');
    });

    return () => {
      cancelled = true;
      clearTimeout(retryTimerRef.current);
    };
  }, [logsUpdated, sendWs]);

  useEffect(() => {
    if (!Array.isArray(wsMessages) || wsMessages.length === 0) return undefined;
    if (wsMessages.length < lastProcessedIndexRef.current) lastProcessedIndexRef.current = 0;
    let cancelled = false;

    (async () => {
      const incoming = [];
      for (let index = lastProcessedIndexRef.current; index < wsMessages.length; index += 1) {
        const raw = wsMessages[index];
        if (typeof raw !== 'string' || !raw.startsWith('{')) continue;
        let payload;
        try { payload = JSON.parse(raw); } catch (_) { continue; }
        if (!payload || payload.type !== 'companyTrainRange' || payload.requestId !== lastRequestIdRef.current) continue;
        if (payload.ok === false || payload.error) {
          if (!statsMapRef.current.size) setStatus('error');
          continue;
        }
        if (!Array.isArray(payload.data)) continue;
        const from = Number.isSafeInteger(payload.from) ? payload.from : null;
        const to = Number.isSafeInteger(payload.to) ? payload.to : null;
        const rangeKey = from !== null && to !== null ? `${from}|${to}` : `payload:${index}`;
        if (rangeKey !== lastSentRangeRef.current || processedRangeRef.current === rangeKey) continue;
        processedRangeRef.current = rangeKey;
        const normalized = payload.data.map(normalizeWorkStat).filter(Boolean);
        incoming.push(...normalized);
      }
      lastProcessedIndexRef.current = wsMessages.length;
      if (cancelled || !incoming.length && processedRangeRef.current == null) return;

      if (incoming.length) {
        for (const stat of incoming) statsMapRef.current.set(stat.date, stat);
      }
      const allStats = [...statsMapRef.current.values()];
      buildAndSetChart(allStats);
      retryRef.current = 0;
      clearTimeout(retryTimerRef.current);
      if (!allStats.length) setStatus('empty');

      let db = null;
      try {
        db = await openWorkStatsDB();
        await persistWorkStats(db, incoming);
      } catch (_) {
        // The live response remains usable when browser persistence is unavailable.
      } finally {
        try { db?.close(); } catch (_) {}
      }
    })().catch(() => {
      if (!cancelled && !statsMapRef.current.size) setStatus('error');
    });

    return () => { cancelled = true; };
  }, [wsMessages]);

  useEffect(() => {
    buildAndSetChart([...statsMapRef.current.values()], false);
  }, [dateFrom, dateTo, darkMode]);

  const visiblePointCount = chartData.datasets.reduce((total, dataset) => total + dataset.data.length, 0);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(previous => !previous)}
        title="Click to show/hide chart"
      >
        Work Stats by Day
      </h5>
      {status === 'loading' ? (
        <div><img src="/images/loader.gif" alt="Loading work statistics" style={{ maxWidth: '80px' }} /></div>
      ) : status === 'error' ? (
        <div role="alert">Work statistics could not be loaded.</div>
      ) : visiblePointCount === 0 ? (
        <div role="status">No work statistics are available for this date range.</div>
      ) : showChart ? (
        <div style={{ height: chartHeight }}>
          <Line
            data={chartData}
            options={themedOptions({
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { title: { display: true, text: 'Day' }, type: 'category' },
                y: { title: { display: true, text: 'Value' }, beginAtZero: true },
              },
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
