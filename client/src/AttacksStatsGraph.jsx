import { useEffect, useState, useRef } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';
import { Bar } from 'react-chartjs-2';

// Passage HTTP -> WebSocket : plus besoin d'URL HTTP
const ONE_DAY = 24 * 60 * 60; // seconds in a day
const START_EPOCH = 1716574650; // à adapter si besoin
const DB_NAME = 'AttacksStatsDB';
const STORE_NAME = 'attacks_stats';

export default function AttacksStatsGraph({ darkMode, wsMessages, sendWs, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [logsEmpty, setLogsEmpty] = useState(false); // si DB vide on propose Refresh
  const [readyToFetch, setReadyToFetch] = useState(false); // devient true si DB non vide OU user clique Refresh
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  // Refs définis AU NIVEAU du composant (respect des règles des hooks)
  const pendingDaysRef = useRef(new Set());
  const statsMapRef = useRef(new Map());
  const lastRequestedRef = useRef(START_EPOCH);
  const initializedRef = useRef(false);
  const lastProcessedIndexRef = useRef(0);

  // Helpers hors hook imbriqué
  async function openStatsDB() {
    return openDB(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          try {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'date' });
            try { store.createIndex('date', 'date'); } catch {}
          } catch {}
        }
      }
    });
  }

  async function getAllStats(db) { try { return await db.getAll(STORE_NAME); } catch { return []; } }
  async function putStat(db, stat) { try { await db.put(STORE_NAME, stat); } catch {} }

  function rebuildChart() {
    const entries = Array.from(statsMapRef.current.values());
    entries.sort((a,b)=> a.date.localeCompare(b.date));
    if (entries.length && onMinDate) {
      try { onMinDate(entries[0].date); } catch {}
    }
    let filtered = entries;
    if (dateFrom) filtered = filtered.filter(e => e.date >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => e.date <= dateTo);
    const baseLabels = filtered.map(s=>s.date);
    const baseDatasets = [
      ds('bar', 0, filtered.map(s=>s.wins||0), { label:'Wins' }),
      ds('bar', 1, filtered.map(s=>s.losses||0), { label:'Losses' }),
      ds('bar', 2, filtered.map(s=>s.attacks||0), { label:'Attacks' }),
      ds('bar', 3, filtered.map(s=>s.defends||0), { label:'Defends' })
    ];
    const { labels, datasets } = filterDatasetsByDate(baseLabels, baseDatasets, dateFrom, dateTo);
    setChartData({ labels, datasets });
  }

  // Initialisation + envois requests manquantes
  useEffect(() => {
    if (initializedRef.current) return;
    (async () => {
      setLoading(true);
      // Vérifie contenu local (attacks_stats) pour décider auto-fetch
      try {
        const statsDb = await openStatsDB();
        let count = 0;
        try {
          const txL = statsDb.transaction(STORE_NAME, 'readonly');
            count = await txL.store.count();
          await txL.done;
        } catch {}
        if (count === 0) setLogsEmpty(true); else setReadyToFetch(true);
      } catch { setLogsEmpty(true); }
      // Charger éventuelles stats existantes (si DB non vide)
      const db = await openStatsDB();
      const existing = await getAllStats(db);
      existing.sort((a,b)=> a.date.localeCompare(b.date));
      existing.forEach(s => statsMapRef.current.set(s.date, s));
      if (existing.length > 0) {
        const lastDate = existing[existing.length - 1].date;
        lastRequestedRef.current = Math.floor(new Date(lastDate).getTime()/1000) + ONE_DAY;
      }
      rebuildChart();
      initializedRef.current = true;
      // Si DB vide, on s'arrête ici (attente clic Refresh)
      if (logsEmpty && !readyToFetch) {
        setLoading(false);
        return;
      }
      // Sinon lancer récupération
      const now = Math.floor(Date.now() / 1000);
      for (let from = lastRequestedRef.current; from < now; from += ONE_DAY) {
        const to = Math.min(from + ONE_DAY, now);
        const dayLabel = new Date(from * 1000).toISOString().slice(0,10);
        pendingDaysRef.current.add(dayLabel);
        try { sendWs(JSON.stringify({ type:'getTornAttacks', from, to })); } catch {}
      }
      if (pendingDaysRef.current.size === 0) setLoading(false);
    })();
  }, [sendWs, logsEmpty, readyToFetch]);

  // Déclenche manuel via bouton Refresh quand DB vide
  const handleManualRefresh = () => {
    setReadyToFetch(true); // relancera l'effet ci-dessus pour fetch
    setLoading(true);
  };

  // Traitement des nouveaux messages
  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;
    (async () => {
      const db = await openStatsDB();
      let updated = false;
      for (let i = lastProcessedIndexRef.current; i < wsMessages.length; i++) {
        const raw = wsMessages[i];
        if (!raw || raw[0] !== '{') continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'getTornAttacks' && typeof parsed.from === 'number') {
            const dayLabel = new Date(parsed.from * 1000).toISOString().slice(0,10);
            if (!statsMapRef.current.has(dayLabel)) {
              const stat = { date: dayLabel, wins: parsed.wins||0, losses: parsed.losses||0, attacks: parsed.attacks||0, defends: parsed.defends||0 };
              statsMapRef.current.set(dayLabel, stat);
              await putStat(db, stat);
              pendingDaysRef.current.delete(dayLabel);
              updated = true;
            }
          }
        } catch {}
      }
      lastProcessedIndexRef.current = wsMessages.length;
      if (updated) rebuildChart();
      if (initializedRef.current && pendingDaysRef.current.size === 0) setLoading(false);
    })();
  }, [wsMessages]);

  // Rebuild when external date range changes
  useEffect(() => { rebuildChart(); }, [dateFrom, dateTo]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Attacks Stats
      </h5>
      {logsEmpty && !readyToFetch ? (
        <div style={{ fontSize: 12, opacity: 0.85, display:'flex', flexDirection:'column', gap:8 }}>
          <span>Aucune donnée d'attaques en cache local.</span>
          <button className="btn btn-sm btn-outline-primary" style={{ width:140 }} onClick={handleManualRefresh}>Refresh</button>
        </div>
      ) : loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: '80px' }} />
        </div>
      ) : (
        showChart && (
          <div style={{ height: 400 }}>
            <Bar
              data={chartData}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: true },
                  title: { display: false },
                  tooltip: { enabled: true },
                },
                scales: {
                  x: {
                    title: { display: true, text: 'Day' },
                    type: 'category',
                  },
                  y: {
                    title: { display: true, text: 'Count' },
                    beginAtZero: true,
                  },
                },
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
