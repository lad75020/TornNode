import { useEffect, useState, useRef } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';
import { Bar } from 'react-chartjs-2';

const ONE_DAY = 24 * 60 * 60;
const START_EPOCH = 1716574650;
const DB_NAME = 'AttacksStatsDB';
const STORE_NAME = 'attacks_stats';
const DAILY_LABEL = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(value) {
  if (typeof value !== 'string' || !DAILY_LABEL.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toCount(value) {
  if (value == null) return 0;
  if (typeof value === 'string' && value.trim() === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null;
}

function normalizeStat(raw) {
  if (!raw || !isValidDay(raw.date)) return null;
  const values = {};
  for (const key of ['wins', 'losses', 'attacks', 'defends']) {
    values[key] = toCount(raw[key]);
    if (values[key] === null) return null;
  }
  return { date: raw.date, ...values };
}

export default function AttacksStatsGraph({ darkMode, wsMessages, sendWs, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);
  const [logsEmpty, setLogsEmpty] = useState(false);
  const [readyToFetch, setReadyToFetch] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [error, setError] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  const pendingDaysRef = useRef(new Set());
  const statsMapRef = useRef(new Map());
  const lastRequestedRef = useRef(START_EPOCH);
  const initializedRef = useRef(false);
  const lastProcessedIndexRef = useRef(0);

  async function openStatsDB() {
    return openDB(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
          try { store.createIndex('date', 'date'); } catch (_) {}
        }
      },
    });
  }

  function rebuildChart() {
    const entries = [...statsMapRef.current.values()]
      .map(normalizeStat)
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length && onMinDate) {
      try { onMinDate(entries[0].date); } catch (_) {}
    }
    const baseLabels = entries.map(entry => entry.date);
    const baseDatasets = [
      ds('bar', 0, entries.map(entry => entry.wins), { label: 'Wins' }),
      ds('bar', 1, entries.map(entry => entry.losses), { label: 'Losses' }),
      ds('bar', 2, entries.map(entry => entry.attacks), { label: 'Attacks' }),
      ds('bar', 3, entries.map(entry => entry.defends), { label: 'Defends' }),
    ];
    const filtered = filterDatasetsByDate(baseLabels, baseDatasets, dateFrom, dateTo);
    setChartData(filtered);
  }

  useEffect(() => {
    if (initializedRef.current && manualRefresh === 0) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      let db = null;
      let existing = [];
      try {
        db = await openStatsDB();
        existing = (await db.getAll(STORE_NAME))
          .map(normalizeStat)
          .filter(Boolean);
      } catch (_) {
        existing = [];
      } finally {
        try { db?.close(); } catch (_) {}
      }
      if (cancelled) return;

      statsMapRef.current = new Map(existing.map(stat => [stat.date, stat]));
      if (existing.length) {
        const lastDate = existing.map(stat => stat.date).sort().at(-1);
        const lastTimestamp = new Date(`${lastDate}T00:00:00.000Z`).getTime();
        if (Number.isFinite(lastTimestamp)) lastRequestedRef.current = Math.floor(lastTimestamp / 1000) + ONE_DAY;
      }
      const cacheIsEmpty = existing.length === 0;
      setLogsEmpty(cacheIsEmpty);
      setReadyToFetch(!cacheIsEmpty || manualRefresh > 0);
      initializedRef.current = true;
      rebuildChart();

      if (cacheIsEmpty && manualRefresh === 0) {
        setLoading(false);
        return;
      }

      pendingDaysRef.current.clear();
      const now = Math.floor(Date.now() / 1000);
      for (let from = lastRequestedRef.current; from < now; from += ONE_DAY) {
        if (cancelled) return;
        const to = Math.min(from + ONE_DAY, now);
        const dayLabel = new Date(from * 1000).toISOString().slice(0, 10);
        pendingDaysRef.current.add(dayLabel);
        try {
          sendWs(JSON.stringify({ type: 'getTornAttacks', from, to }));
        } catch (_) {
          pendingDaysRef.current.delete(dayLabel);
        }
      }
      if (pendingDaysRef.current.size === 0) setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setLogsEmpty(true);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [sendWs, manualRefresh]);

  const handleManualRefresh = () => {
    setReadyToFetch(true);
    setLogsEmpty(false);
    setLoading(true);
    setManualRefresh(value => value + 1);
  };

  useEffect(() => {
    if (!Array.isArray(wsMessages) || wsMessages.length === 0) return undefined;
    if (wsMessages.length < lastProcessedIndexRef.current) lastProcessedIndexRef.current = 0;
    let cancelled = false;

    (async () => {
      let db = null;
      try { db = await openStatsDB(); } catch (_) {}
      let updated = false;
      for (let index = lastProcessedIndexRef.current; index < wsMessages.length; index += 1) {
        const raw = wsMessages[index];
        if (typeof raw !== 'string' || !raw.startsWith('{')) continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { continue; }
        if (!parsed || parsed.type !== 'getTornAttacks') continue;
        if (parsed.error) {
          pendingDaysRef.current.clear();
          setError(true);
          setLoading(false);
          continue;
        }
        if (!Number.isSafeInteger(parsed.from) || parsed.from < 0) continue;
        const responseDate = new Date(parsed.from * 1000);
        if (!Number.isFinite(responseDate.getTime())) continue;
        const dayLabel = responseDate.toISOString().slice(0, 10);
        pendingDaysRef.current.delete(dayLabel);
        const stat = normalizeStat({ date: dayLabel, ...parsed });
        if (!stat || statsMapRef.current.has(dayLabel)) continue;
        statsMapRef.current.set(dayLabel, stat);
        if (db) {
          try { await db.put(STORE_NAME, stat); } catch (_) {}
        }
        updated = true;
      }
      lastProcessedIndexRef.current = wsMessages.length;
      try { db?.close(); } catch (_) {}
      if (cancelled) return;
      if (updated) {
        setError(false);
        rebuildChart();
      }
      if (initializedRef.current && pendingDaysRef.current.size === 0) setLoading(false);
    })().catch(() => {
      if (!cancelled && initializedRef.current) {
        setError(true);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [wsMessages]);

  useEffect(() => { rebuildChart(); }, [dateFrom, dateTo, darkMode]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(prev => !prev)}
        title="Click to show/hide chart"
      >
        Attacks Stats
      </h5>
      {logsEmpty && !readyToFetch ? (
        <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>No attack data is available in the local cache.</span>
          <button className="btn btn-sm btn-outline-primary" style={{ width: 140 }} onClick={handleManualRefresh}>Refresh</button>
        </div>
      ) : loading ? (
        <div><img src="/images/loader.gif" alt="Loading attacks statistics" style={{ maxWidth: '80px' }} /></div>
      ) : error ? (
        <div role="alert">Attack statistics could not be loaded.</div>
      ) : chartData.labels.length === 0 ? (
        <div role="status">No attack data is available for this date range.</div>
      ) : (
        showChart && (
          <div style={{ height: 400 }}>
            <Bar
              data={chartData}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { title: { display: true, text: 'Day' }, type: 'category' },
                  y: { title: { display: true, text: 'Count' }, beginAtZero: true },
                },
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
