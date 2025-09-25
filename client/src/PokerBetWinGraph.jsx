import React, { useEffect, useState, useRef } from 'react';
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  CategoryScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Bar } from 'react-chartjs-2';
import { openDB } from 'idb';
import { applyCommonChartOptions } from './chartTheme.js';

// NOTE (memory entity): frontend-component PokerBetWinGraph uses_util indexeddb (openDB) & chartTheme.
// Pattern: simple IndexedDB scan filtering by title substring 'poker'. If this component becomes central,
// update memory graph via `npm run memory:entities` and `npm run memory:relations`.

ChartJS.register(BarElement, LinearScale, TimeScale, Tooltip, Legend, CategoryScale);

/**
 * PokerBetWinGraph
 * Visualise les logs contenant "poker" dans leur titre.
 * Deux séries: Bet Amount & Won Amount.
 * X = timestamp (converti en Date) avec une échelle temporelle.
 */
export default function PokerBetWinGraph({ darkMode, chartHeight = 400, dateFrom, dateTo, logsUpdated }) {
  const [pointsBet, setPointsBet] = useState([]); // { t: Date, v: number }
  const [pointsWon, setPointsWon] = useState([]); // { t: Date, v: number }
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  // Always aggregated daily now (toggle removed)
  const fetchedRef = useRef(false);

  // Helper: date range filter (inclusive) if provided (YYYY-MM-DD)
  function inRange(dateObj) {
    if (!dateFrom && !dateTo) return true;
    const isoDay = dateObj.toISOString().slice(0, 10);
    if (dateFrom && isoDay < dateFrom) return false;
    if (dateTo && isoDay > dateTo) return false;
    return true;
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const db = await openDB('LogsDB');
        if (!db.objectStoreNames.contains('logs')) {
          setPointsBet([]); setPointsWon([]); setLoading(false); return;
        }
        // Iterate over all logs (we need multiple log codes). If performance becomes an issue, consider indexed queries per code.
        const tx = db.transaction('logs', 'readonly');
        const all = await tx.store.getAll();
        await tx.done;
        const betArr = [];
        const wonArr = [];
        const betCodes = new Set([8427, 8415, 8428, 8416]);
        const winCode = 8435;
        for (const obj of all) {
          if (!obj || typeof obj.timestamp !== 'number') continue;
          const logCode = obj.log;
          if (typeof logCode !== 'number') continue;
          const isBet = betCodes.has(logCode);
          const isWin = logCode === winCode;
          if (!isBet && !isWin) continue;
          const tsDate = new Date(obj.timestamp * 1000);
          if (!inRange(tsDate)) continue;
          const value = Number(obj?.data?.value) || 0;
          if (isBet && value !== 0) betArr.push({ t: tsDate, v: value });
          if (isWin && value !== 0) wonArr.push({ t: tsDate, v: value });
        }
        betArr.sort((a,b) => a.t - b.t);
        wonArr.sort((a,b) => a.t - b.t);
        setPointsBet(betArr);
        setPointsWon(wonArr);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('PokerBetWinGraph load error', e);
        setPointsBet([]); setPointsWon([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [logsUpdated, dateFrom, dateTo]);

  // Build datasets as array of {x: Date, y: number|null} to avoid Chart.js errors with time scale.
  // This replaces previous labels+primitive arrays approach which caused 'Cannot read properties of null (reading "x")'
  // when parsing was disabled and labels held Date objects.
  let betPoints = [];
  let wonPoints = [];
  // Daily aggregation only
  const dayBet = {};
  const dayWon = {};
  for (const p of pointsBet) {
    const day = p.t.toISOString().slice(0,10);
    dayBet[day] = (dayBet[day] || 0) + p.v;
  }
  for (const p of pointsWon) {
    const day = p.t.toISOString().slice(0,10);
    dayWon[day] = (dayWon[day] || 0) + p.v;
  }
  const days = Array.from(new Set([...Object.keys(dayBet), ...Object.keys(dayWon)])).sort();
  betPoints = days.map(d => ({ x: new Date(d + 'T00:00:00Z'), y: dayBet[d] ?? 0 }));
  wonPoints = days.map(d => ({ x: new Date(d + 'T00:00:00Z'), y: dayWon[d] ?? 0 }));
  // Profit (could be negative): win - bet per day
  const profitPoints = days.map(d => ({ x: new Date(d + 'T00:00:00Z'), y: (dayWon[d] || 0) - (dayBet[d] || 0) }));

  const colorBet = darkMode ? 'rgba(255,140,0,0.80)' : 'rgba(255,99,132,0.80)';
  const colorBetBorder = darkMode ? 'rgba(255,140,0,1)' : 'rgba(255,99,132,1)';
  const colorWon = darkMode ? 'rgba(100,200,255,0.80)' : 'rgba(54,162,235,0.80)';
  const colorWonBorder = darkMode ? 'rgba(100,200,255,1)' : 'rgba(54,162,235,1)';
  const colorProfit = darkMode ? 'rgba(90,220,120,0.9)' : 'rgba(60,180,95,0.9)';

  const data = {
    datasets: [
      {
        type: 'bar',
        label: 'Bet Amount',
        data: betPoints,
        backgroundColor: colorBet,
        borderColor: colorBetBorder,
        borderWidth: 1,
        yAxisID: 'y',
        parsing: true,
      },
      {
        type: 'bar',
        label: 'Won Amount',
        data: wonPoints,
        backgroundColor: colorWon,
        borderColor: colorWonBorder,
        borderWidth: 1,
        yAxisID: 'y',
        parsing: true,
      },
      {
        type: 'line',
        label: 'Profit (Win - Bet)',
        data: profitPoints,
        borderColor: colorProfit,
        backgroundColor: colorProfit,
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.15,
        yAxisID: 'y',
        parsing: true,
      }
    ]
  };

  const options = applyCommonChartOptions({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        type: 'time',
        // Time scale; min/max auto
        ticks: { maxRotation: 0 },
      },
      y: {
        title: { display: true, text: 'Amount' },
        beginAtZero: false,
        grace: '5%',
      },
    },
    plugins: {
      legend: { display: true },
      tooltip: { enabled: true },
    }
  }, darkMode);

  return (
    <div
      className="card"
      style={{
        height: chartHeight,
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 0,
        ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0', border:'1px solid #2a2a2a' } : {})
      }}
    >
      <div
        className="card-body"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0.75rem 0.75rem 0.5rem',
          ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0' } : {})
        }}
      >
        <h5
          className="card-title"
          style={{
            marginBottom: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
            userSelect: 'none',
            ...(darkMode ? { background:'#222', color:'#e0e0e0' } : {})
          }}
          onClick={() => setShowChart(p => !p)}
          title="Click to show/hide chart"
        >
          Poker Bet vs Win
        </h5>
        <div style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div>
              <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} />
            </div>
          ) : showChart ? (
            <>
              <div style={{ position:'relative', width:'100%', height:'100%' }}>
                <Bar data={data} options={options} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
