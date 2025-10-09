import { useEffect, useState } from 'react';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import useChartTheme from './useChartTheme.js';

import { Bar } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';

export default function BloodCountGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [totalWithdrawal, setTotalWithdrawal] = useState(null);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    const dbName = 'LogsDB';
    const storeName = 'logs';
    const request = window.indexedDB.open(dbName);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        setLoading(false);
        return;
      }
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const logIndex = store.index('log');
      const logsToFetch = [2340, 2100];
      const dayCounts = { 2340: {}, 2100: {} };
      let pending = logsToFetch.length;
      logsToFetch.forEach(logVal => {
        const range = IDBKeyRange.only(logVal);
        const cursorReq = logIndex.openCursor(range);
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const obj = cursor.value;
            if (typeof obj.timestamp === 'number') {
              const day = new Date(obj.timestamp * 1000).toLocaleDateString();
              if (!dayCounts[logVal][day]) {
                dayCounts[logVal][day] = 0;
              }
              dayCounts[logVal][day]++;
            }
            cursor.continue();
          } else {
            pending--;
            if (pending === 0) {
              // Prepare chart data
              // Store the earliest timestamp for each day from the log objects
              const dayTsMap = {};
              [2340, 2100].forEach(logVal => {
                Object.keys(dayCounts[logVal]).forEach(day => {
                  if (!dayTsMap[day]) {
                    dayTsMap[day] = null;
                  }
                });
              });
              let pending2 = logsToFetch.length;
              logsToFetch.forEach(logVal => {
                const range = IDBKeyRange.only(logVal);
                const cursorReq2 = logIndex.openCursor(range);
                cursorReq2.onsuccess = (e2) => {
                  const cursor2 = e2.target.result;
                  if (cursor2) {
                    const obj2 = cursor2.value;
                    if (typeof obj2.timestamp === 'number') {
                      const day = new Date(obj2.timestamp * 1000).toLocaleDateString();
                      if (dayTsMap[day] === null || obj2.timestamp < dayTsMap[day]) {
                        dayTsMap[day] = obj2.timestamp;
                      }
                    }
                    cursor2.continue();
                  } else {
                    pending2--;
                    if (pending2 === 0) {
                      // After all cursors, sort days by min timestamp
                      const sortedDays = Object.keys(dayTsMap)
                        .map(day => ({ day, ts: dayTsMap[day] }))
                        .sort((a, b) => a.ts - b.ts)
                        .map(obj => obj.day);
                              const data2340 = sortedDays.map(day => dayCounts[2340][day] || 0);
                              const data2100 = sortedDays.map(day => (dayCounts[2100][day] ? -1 * dayCounts[2100][day] : 0));
                              if (sortedDays.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(sortedDays[0])) {
                                try { onMinDate(sortedDays[0]); } catch {}
                              }
                              let datasets = [
                                ds('bar', 0, data2340, { label: 'Deposit', borderWidth: 1 }),
                                ds('bar', 1, data2100, { label: 'Withdrawal', borderWidth: 1 })
                              ];
                              const filtered = filterDatasetsByDate(sortedDays, datasets, dateFrom, dateTo);
                              setChartData(filtered);
                      // Calcul du total des retraits (withdrawal)
                      const total = data2340.reduce((acc, v) => acc + v, 0);
                      setTotalWithdrawal(total);
                      setLoading(false);
                    }
                  }
                };
              });
            }
          }
        };
      });
    };
  }, [logsUpdated]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Blood transactions
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <>
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
                    x: {
                      title: { display: true, text: 'Day' },
                      type: 'category',
                    },
                    y: {
                      title: { display: true, text: 'Count' },
                      beginAtZero: true,
                      type: 'linear',
                    },
                  },
                })}
              />
            </div>
            <InlineStat id="bloodTotalWithdrawals" label="Total withdrawals:" value={totalWithdrawal} />
          </>
        )
      )}
    </div>
  );
}
