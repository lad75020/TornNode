import { useEffect, useState, useRef } from 'react';
import useChartTheme from './useChartTheme.js';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Communication désormais via WebSocket (message JSON type: companyTrainRange)
const START_EPOCH = 1716574650; // initial from value
const ONE_DAY = 24 * 60 * 60; // seconds in a day (unused now but kept for potential incremental requests)

import { filterDatasetsByDate } from './dateFilterUtil.js';

export default function WorkStatsGraph({ logsUpdated, darkMode, chartHeight = 400, wsMessages = [], sendWs, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);
  const requestSentRef = useRef(false);      // a-t-on envoyé la requête WS
  const processedRangeRef = useRef(null);    // plage déjà traitée
  const lastSentRangeRef = useRef(null);     // dernière plage envoyée
  const retryRef = useRef(0);                // retries effectués
  const retryTimerRef = useRef(null);        // timer courant
  // Permet d'autoriser un nouvel envoi WS après un refresh des logs
  useEffect(() => { requestSentRef.current = false; }, [logsUpdated]);
  
  function buildAndSetChart(stats) {
      const sorted = [...stats].sort((a, b) => new Date(a.date) - new Date(b.date));
      if (sorted.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(sorted[0].date)) {
        try { onMinDate(sorted[0].date); } catch {}
      }
      const filteredByRange = sorted.filter(s => {
        if (dateFrom && s.date < dateFrom) return false;
        if (dateTo && s.date > dateTo) return false;
        return true;
      });
      let manualSum = 0, intelligenceSum = 0, enduranceSum = 0;
      const days = [], manual = [], intelligence = [], endurance = [];
      for (const s of filteredByRange) {
        const isAbs = !!s.abs; // défini côté serveur quand données issues de Stats
        if (isAbs) {
          manualSum = (s.manual || 0);
          intelligenceSum = (s.intelligence || 0);
          enduranceSum = (s.endurance || 0);
        } else {
          manualSum += s.manual || 0;
          intelligenceSum += s.intelligence || 0;
          enduranceSum += s.endurance || 0;
        }
        days.push(s.date);
        manual.push(manualSum);
        intelligence.push(intelligenceSum);
        endurance.push(enduranceSum);
      }
      setChartData({
        labels: days,
        datasets: [
          ds('line', 0, manual, { label: 'Manual', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
          ds('line', 1, intelligence, { label: 'Intelligence', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
          ds('line', 2, endurance, { label: 'Endurance', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
        ]
      });
    }

  // Chargement initial + envoi requête WS
  useEffect(() => {
      let cancelled = false;
      async function openDB() {
        return new Promise((resolve, reject) => {
          const req = window.indexedDB.open('WorkStatsDB', 1);
          req.onupgradeneeded = (e) => {
            const dbu = e.target.result;
            if (!dbu.objectStoreNames.contains('work_stats')) {
              dbu.createObjectStore('work_stats', { keyPath: 'date' });
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = (e) => reject(e.target.error);
        });
      }
      async function getAll(db) {
        return new Promise((resolve) => {
          const tx = db.transaction('work_stats', 'readonly');
          const r = tx.objectStore('work_stats').getAll();
          r.onsuccess = () => resolve(r.result || []);
          r.onerror = () => resolve([]);
        });
      }
      (async () => {
        setLoading(true);
        const db = await openDB();
        if (cancelled) return;
        const cached = await getAll(db);
        const cachedArr = Array.isArray(cached) ? cached : [];
        if (cachedArr.length) {
          buildAndSetChart(cachedArr);
          setLoading(false); // on montre le cache immédiatement
        }
        if (!requestSentRef.current && sendWs) {
          requestSentRef.current = true;
          const now = Math.floor(Date.now() / 1000);
          const rangeKey = `${START_EPOCH}|${now}`;
          lastSentRangeRef.current = rangeKey;
          try { sendWs(JSON.stringify({ type: 'companyTrainRange', from: START_EPOCH, to: now })); } catch {}
          // Planifier un retry si aucune réponse pertinente n'arrive
          if (!cachedArr.length) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              // Si la plage envoyée n'a pas été traitée, réessayer (max 3 fois)
              if (processedRangeRef.current !== lastSentRangeRef.current && retryRef.current < 3) {
                retryRef.current += 1;
                requestSentRef.current = false; // autoriser un nouvel envoi
                try {
                  const now2 = Math.floor(Date.now() / 1000);
                  lastSentRangeRef.current = `${START_EPOCH}|${now2}`;
                  requestSentRef.current = true;
                  sendWs(JSON.stringify({ type: 'companyTrainRange', from: START_EPOCH, to: now2 }));
                } catch {}
              }
            }, 2000 * Math.max(1, retryRef.current + 1));
          }
        }
      })();
      return () => { cancelled = true; clearTimeout(retryTimerRef.current); };
  }, [logsUpdated, sendWs]);

  // Réception des données WS
  useEffect(() => {
      if (!Array.isArray(wsMessages) || wsMessages.length === 0) return;
      // Chercher le dernier message pertinent
      for (let i = wsMessages.length - 1; i >= 0; i--) {
        const m = wsMessages[i];
        if (typeof m === 'string' && m.startsWith('{')) {
          try {
            const p = JSON.parse(m);
              if (p.type === 'companyTrainRange' && Array.isArray(p.data)) {
              const key = `${p.from}|${p.to}`;
              if (processedRangeRef.current === key) return; // déjà traité
              processedRangeRef.current = key;
              // Reçu: reset retry state
              retryRef.current = 0;
              clearTimeout(retryTimerRef.current);
              (async () => {
                const db = await new Promise((resolve, reject) => {
                  const req = window.indexedDB.open('WorkStatsDB', 1);
                  req.onupgradeneeded = (e) => {
                    const dbu = e.target.result;
                    if (!dbu.objectStoreNames.contains('work_stats')) {
                      dbu.createObjectStore('work_stats', { keyPath: 'date' });
                    }
                  };
                  req.onsuccess = (e) => resolve(e.target.result);
                  req.onerror = (e) => reject(e.target.error);
                });
                // Insérer / maj toutes les stats
                await Promise.all(p.data.map(stat => new Promise((resolve) => {
                  const tx = db.transaction('work_stats', 'readwrite');
                  tx.objectStore('work_stats').put(stat).onsuccess = () => resolve();
                })));
                const all = await new Promise((resolve) => {
                  const tx = db.transaction('work_stats', 'readonly');
                  const r = tx.objectStore('work_stats').getAll();
                  r.onsuccess = () => resolve(r.result || []);
                  r.onerror = () => resolve([]);
                });
                buildAndSetChart(all);
                setLoading(false);
              })();
              return; // stop après dernier pertinent
            }
          } catch { /* ignore JSON parse */ }
        }
      }
  }, [wsMessages]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(p => !p)}
        title="Click to show/hide chart"
      >
        Work Stats by Day
      </h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : (
        showChart && (
          <div style={{ height: chartHeight }}>
            <Line
              data={chartData}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
                scales: {
                  x: { title: { display: true, text: 'Day' }, type: 'category' },
                  y: { title: { display: true, text: 'Value' }, beginAtZero: true }
                }
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
