import { useEffect, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';

import { Line } from 'react-chartjs-2';
import InlineStat from './InlineStat.jsx';

export default function FactionBalanceChart({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [totalIncreases, setTotalIncreases] = useState(null);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) {
        setLoading(false);
        return;
      }
      const index = db.transaction(storeName).store.index('log');
      const all = await index.getAll(6738);
      all.push(... await index.getAll(6795));
      const points = [];
      for (const obj of all) {
        if (obj.data && typeof obj.data.balance_after === 'number' && typeof obj.timestamp === 'number') {
          // Convert Unix seconds to milliseconds for Chart.js time scale
          points.push({ x: obj.timestamp * 1000, y: obj.data.balance_after });
        }
      }
      points.sort((a, b) => a.x - b.x);
      let pts = points;
      if (dateFrom || dateTo) {
        pts = points.filter(p => {
          const day = new Date(p.x).toISOString().slice(0,10);
          if (dateFrom && day < dateFrom) return false;
          if (dateTo && day > dateTo) return false;
          return true;
        });
      }
      if (points.length) {
        const firstDay = new Date(points[0].x).toISOString().slice(0,10);
        if (onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDay)) { try { onMinDate(firstDay); } catch {} }
      }
      setChartData({
        datasets: [
          ds('line', 0, pts, { label: 'Balance', pointRadius: 3, showLine: true, fill: false, tension: 0.2 })
        ],
      });
      // Calcul du total des augmentations (somme des incréments positifs)
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const diff = points[i].y - points[i - 1].y;
        if (diff > 0) total += diff;
      }
      setTotalIncreases(total);
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Faction balance
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <>
            <div style={{ height: chartHeight }}>
              <Line
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
                      title: { display: true, text: 'Date' },
                      type: 'time',
                      time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' }, tooltipFormat: 'yyyy-MM-dd' },
                      ticks: { source: 'auto', maxRotation: 0, autoSkip: true },
                    },
                    y: {
                      title: { display: true, text: 'Balance' },
                      beginAtZero: true,
                    },
                  },
                })}
              />
            </div>
            <InlineStat id="factionEarnedTotal" label="Earned Total:" value={totalIncreases} />
          </>
        )
      )}
    </div>
  );
}
