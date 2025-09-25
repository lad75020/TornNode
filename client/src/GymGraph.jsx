import { useEffect, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';

import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import{
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function GymGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) return;
      const index = db.transaction(storeName).store.index('log');
      // Speed
      const all5302 = await index.getAll(5302);
      const points5302 = all5302
        .filter(obj => obj.data && typeof obj.data.speed_after === 'number')
  .map(obj => ({ x: obj.timestamp * 1000, y: obj.data.speed_after }));
      // Dexterity
      const all5303 = await index.getAll(5303);
      const points5303 = all5303
        .filter(obj => obj.data && typeof obj.data.dexterity_after === 'number')
  .map(obj => ({ x: obj.timestamp * 1000, y: obj.data.dexterity_after }));
      // Strength
      const all5300 = await index.getAll(5300);
      const points5300 = all5300
        .filter(obj => obj.data && typeof obj.data.strength_after === 'number')
  .map(obj => ({ x: obj.timestamp * 1000, y: obj.data.strength_after }));
      // Defense
      const all5301 = await index.getAll(5301);
      const points5301 = all5301
        .filter(obj => obj.data && typeof obj.data.defense_after === 'number')
  .map(obj => ({ x: obj.timestamp * 1000, y: obj.data.defense_after }));
      // Sort all datasets by x (timestamp)
      points5302.sort((a, b) => a.x - b.x);
      points5303.sort((a, b) => a.x - b.x);
      points5300.sort((a, b) => a.x - b.x);
      points5301.sort((a, b) => a.x - b.x);
      const allPoints = [points5302, points5303, points5300, points5301];
      let minDay = null;
      if (allPoints.some(arr => arr.length)) {
        const firstTs = Math.min(...allPoints.filter(a=>a.length).map(a=>a[0].x));
        if (isFinite(firstTs)) minDay = new Date(firstTs).toISOString().slice(0,10);
      }
      if (minDay && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(minDay)) { try { onMinDate(minDay); } catch {} }
      function rangeFilter(arr){
        if (!dateFrom && !dateTo) return arr;
        return arr.filter(p => {
          const d = new Date(p.x).toISOString().slice(0,10);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
      }
      setChartData({
        datasets: [
          ds('line', 0, rangeFilter(points5302), { label: 'Speed', borderColor: 'rgba(255, 165, 0, 0.9)', backgroundColor: 'rgba(255, 165, 0, 0.3)', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
          ds('line', 1, rangeFilter(points5303), { label: 'Dexterity', borderColor: 'rgba(0, 123, 255, 0.9)', backgroundColor: 'rgba(0, 123, 255, 0.3)', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
          ds('line', 2, rangeFilter(points5300), { label: 'Strength', borderColor: 'rgba(40, 167, 69, 0.9)', backgroundColor: 'rgba(40, 167, 69, 0.3)', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
          ds('line', 3, rangeFilter(points5301), { label: 'Defense', borderColor: 'rgba(220, 53, 69, 0.9)', backgroundColor: 'rgba(220, 53, 69, 0.3)', pointRadius: 3, showLine: true, fill: false, tension: 0.2 }),
        ],
      });
      setLoading(false);
    }
    fetchData();
  }, [logsUpdated]);

  return (
    <div >
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Battle stats
      </h5>
      {chartData.datasets.length === 0 ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
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
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'PPpp' },
                    adapters: {},
                    title: { display: true, text: 'Date' },
                    ticks: { maxRotation: 0, autoSkip: true }
                  },
                  y: { title: { display: true, text: 'Value' }, beginAtZero: true },
                },
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
