import { useEffect, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { openDB } from 'idb';
import { Scatter } from 'react-chartjs-2';

// Helper to assign a color to each crime type
const colorMap = {};
const getColor = (crime) => {
  if (!colorMap[crime]) {
    // Generate a random color for each unique crime
    colorMap[crime] = `hsl(${Object.keys(colorMap).length * 47 % 360}, 70%, 55%)`;
  }
  return colorMap[crime];
};

export default function CrimeScatterGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    async function fetchData() {
      const db = await openDB('LogsDB');
      const storeName = 'logs';
      if (!db.objectStoreNames.contains(storeName)) return;
      const index = db.transaction(storeName).store.index('log');
      const all = await index.getAll(9005);
      const pointsByCrime = {};
      for (const obj of all) {
        const crime = obj.data && obj.data.crime ? obj.data.crime : 'unknown';
        const skill = obj.data && typeof obj.data.skill_level === 'number' ? obj.data.skill_level : null;
        if (skill !== null) {
          if (!pointsByCrime[crime]) pointsByCrime[crime] = [];
          // Convert seconds to milliseconds for Chart.js time scale
          pointsByCrime[crime].push({ x: obj.timestamp * 1000, y: skill });
        }
      }
      // Determine global earliest timestamp (for min date persistence)
      let earliestTs = null;
      for (const arr of Object.values(pointsByCrime)) {
        for (const p of arr) {
          if (earliestTs === null || p.x < earliestTs) earliestTs = p.x;
        }
      }
      if (earliestTs && onMinDate) {
        const day = new Date(earliestTs).toISOString().slice(0,10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(day)) { try { onMinDate(day); } catch {} }
      }
      // Prepare datasets for each crime with date range filtering (day-based)
      const datasets = Object.entries(pointsByCrime).map(([crime, points], idx) => {
        // Trier par timestamp pour que la ligne connecte dans l'ordre temporel
        points.sort((a,b) => a.x - b.x);
        const filteredPoints = (dateFrom || dateTo) ? points.filter(p => {
          const day = new Date(p.x).toISOString().slice(0,10);
          if (dateFrom && day < dateFrom) return false;
          if (dateTo && day > dateTo) return false;
          return true;
        }) : points;
        const color = getColor(crime);
        return ds('scatter', idx, filteredPoints, {
          label: crime,
          backgroundColor: color,
          borderColor: color,
          pointRadius: 4,
          showLine: true,
          borderWidth: 1.5,
          tension: 0.15,
          spanGaps: false
        });
      });
      setChartData({ datasets });
    }
    fetchData();
  }, [logsUpdated, dateFrom, dateTo, onMinDate]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Crime Skill Levels
      </h5>
      {showChart && (
  <div style={{ height: chartHeight }}>
          <Scatter
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
                  title: { display: true, text: 'Crime skills' },
                  beginAtZero: true,
                },
              },
            })}
          />
        </div>
      )}
    </div>
  );
}
