import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';
import { Bar } from 'react-chartjs-2';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function BetResultsGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  // Appel du hook une seule fois au niveau racine
  const { ds, themedOptions } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) {
        setLoading(false);
        return;
      }
      const logsToFetch = [8300, 8301];
      const daySums = { 8300: {}, 8301: {} };
      // 1. Récupérer tous les logs pour chaque type
      for (const logVal of logsToFetch) {
        const index = db.transaction(storeName).store.index('log');
        const all = await index.getAll(logVal);
        for (const obj of all) {
          if (typeof obj.timestamp === 'number' && obj.data) {
            const day = new Date(obj.timestamp * 1000).toLocaleDateString();
            if (!daySums[logVal][day]) daySums[logVal][day] = 0;
            if (logVal === 8300) {
              daySums[logVal][day] += (Number(obj.data.won_amount) || 0) - (Number(obj.data.bet_amount) || 0);
            } else if (logVal === 8301) {
              daySums[logVal][day] += -1 * (Number(obj.data.bet_amount) || 0);
            }
          }
        }
      }
      // 2. Trouver le timestamp le plus bas pour chaque jour
      const dayTsMap = {};
      for (const logVal of logsToFetch) {
        const index = db.transaction(storeName).store.index('log');
        const all = await index.getAll(logVal);
        for (const obj of all) {
          if (typeof obj.timestamp === 'number') {
            const day = new Date(obj.timestamp * 1000).toLocaleDateString();
            if (dayTsMap[day] === undefined || obj.timestamp < dayTsMap[day]) {
              dayTsMap[day] = obj.timestamp;
            }
          }
        }
      }
      const sortedDays = Object.keys(dayTsMap)
        .map(day => ({ day, ts: dayTsMap[day] }))
        .sort((a, b) => a.ts - b.ts)
        .map(obj => obj.day);
      // 3. Appliquer la condition sur les jours
      sortedDays.forEach(day => {
        if ((daySums[8300][day]) > -1 * daySums[8301][day]) {
          daySums[8301][day] = 0;
        }
      });
      const data8300 = sortedDays.map(day => daySums[8300][day] || 0);
      const data8301 = sortedDays.map(day => daySums[8301][day] || 0);
      if (sortedDays.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(sortedDays[0])) {
        try { onMinDate(sortedDays[0]); } catch {}
      }
      const base = { labels: sortedDays, datasets: [
        ds('bar', 0, data8300, { label: 'Gain', borderWidth: 1 }),
        ds('bar', 1, data8301, { label: 'Bets', borderWidth: 1 }),
      ]};
      const filtered = filterDatasetsByDate(base.labels, base.datasets, dateFrom, dateTo);
      setChartData(filtered);
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated, darkMode, dateFrom, dateTo, onMinDate]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Slots Results
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <div style={{ height: chartHeight }}>
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
                  x: { title: { display: true, text: 'Day' }, type: 'category' },
                  y: { title: { display: true, text: 'Amount' }, beginAtZero: true, type: 'linear' },
                },
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
