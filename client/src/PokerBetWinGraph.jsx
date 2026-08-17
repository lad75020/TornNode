import { useEffect, useMemo, useState } from 'react';
import 'chartjs-adapter-date-fns';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { filterBuckets, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

const BET_LOG_IDS = [8427, 8415, 8428, 8416];
const WIN_LOG_ID = 8435;

export default function PokerBetWinGraph({ darkMode, chartHeight = 400, dateFrom, dateTo, logsUpdated }) {
  const [rows, setRows] = useState({ bets: [], wins: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([...BET_LOG_IDS, WIN_LOG_ID].map(logId => getLogsByLogId(logId)))
      .then(results => {
        if (cancelled) return;
        const bets = [];
        const wins = [];
        results.forEach((entries, index) => {
          for (const row of Array.isArray(entries) ? entries : []) {
            const date = toUnixDate(row?.timestamp);
            const value = toFiniteNumber(row?.data?.value);
            if (!date || value === null || value === 0) continue;
            const point = { date, value };
            if (index === results.length - 1) wins.push(point);
            else bets.push(point);
          }
        });
        setRows({ bets, wins });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRows({ bets: [], wins: [] });
        setError('Poker results could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated]);

  const aggregated = useMemo(() => {
    const daily = new Map();
    const add = (point, field) => {
      const label = point.date.toISOString().slice(0, 10);
      const current = daily.get(label) || { bet: 0, win: 0 };
      current[field] += point.value;
      daily.set(label, current);
    };
    rows.bets.forEach(point => add(point, 'bet'));
    rows.wins.forEach(point => add(point, 'win'));
    const labels = [...daily.keys()].sort();
    const bet = labels.map(label => daily.get(label).bet);
    const win = labels.map(label => daily.get(label).win);
    const profit = labels.map((label, index) => win[index] - bet[index]);
    return { labels, bet, win, profit };
  }, [rows]);

  const filtered = useMemo(() => filterBuckets(
    aggregated.labels,
    [{ label: 'Bet Amount', data: aggregated.bet }, { label: 'Won Amount', data: aggregated.win }, { label: 'Profit (Win - Bet)', data: aggregated.profit }],
    dateFrom,
    dateTo,
    'day',
  ), [aggregated, dateFrom, dateTo]);

  const data = useMemo(() => ({
    labels: filtered.labels,
    datasets: [
      ds('bar', 0, filtered.datasets[0]?.data || [], { label: 'Bet Amount', yAxisID: 'y', borderWidth: 1 }),
      ds('bar', 1, filtered.datasets[1]?.data || [], { label: 'Won Amount', yAxisID: 'y', borderWidth: 1 }),
      ds('line', 2, filtered.datasets[2]?.data || [], { label: 'Profit (Win - Bet)', yAxisID: 'y', borderWidth: 2, pointRadius: 2, tension: 0.15 }),
    ],
  }), [ds, filtered]);

  return (
    <div className="card" style={{ height: chartHeight, display: 'flex', flexDirection: 'column', marginBottom: 0, ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0', border: '1px solid #2a2a2a' } : {}) }}>
      <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.75rem 0.75rem 0.5rem', ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0' } : {}) }}>
        <h5 className="card-title" style={{ marginBottom: '0.5rem', fontSize: '1rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)}>Poker Bet vs Win</h5>
        <div style={{ flex: 1, minHeight: 0 }}>
          {loading ? (
            <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
          ) : error || filtered.labels.length === 0 ? (
            <div role="status">{error || 'No poker results available for this range.'}</div>
          ) : showChart ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <Bar data={data} options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { x: { type: 'time', ticks: { maxRotation: 0 } }, y: { title: { display: true, text: 'Amount' }, beginAtZero: false, grace: '5%' } },
                plugins: { legend: { display: true }, tooltip: { enabled: true } },
              })} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
