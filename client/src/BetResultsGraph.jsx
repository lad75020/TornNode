import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { filterBuckets, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

export default function BetResultsGraph({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [source, setSource] = useState({ labels: [], gain: [], bets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const { ds, themedOptions } = useChartTheme(darkMode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getLogsByLogId(8300), getLogsByLogId(8301)])
      .then(([wins, bets]) => {
        if (cancelled) return;
        const days = new Map();
        const add = (row, gain, bet) => {
          const date = toUnixDate(row?.timestamp);
          if (!date) return;
          const label = date.toISOString().slice(0, 10);
          const current = days.get(label) || { gain: 0, bets: 0 };
          current.gain += gain;
          current.bets += bet;
          days.set(label, current);
        };
        for (const row of Array.isArray(wins) ? wins : []) {
          const won = toFiniteNumber(row?.data?.won_amount);
          const wager = toFiniteNumber(row?.data?.bet_amount);
          if (won !== null && wager !== null) add(row, won - wager, 0);
        }
        for (const row of Array.isArray(bets) ? bets : []) {
          const wager = toFiniteNumber(row?.data?.bet_amount);
          if (wager !== null) add(row, 0, -wager);
        }
        const labels = [...days.keys()].sort();
        const gain = labels.map(label => days.get(label).gain);
        const betValues = labels.map(label => days.get(label).bets);
        for (let index = 0; index < labels.length; index += 1) {
          if (gain[index] > -betValues[index]) betValues[index] = 0;
        }
        setSource({ labels, gain, bets: betValues });
        setLoading(false);
        if (labels.length && typeof onMinDate === 'function') {
          try { onMinDate(labels[0]); } catch (_) {}
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSource({ labels: [], gain: [], bets: [] });
        setError('Slot results could not be loaded.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [logsUpdated, onMinDate]);

  const filtered = useMemo(() => filterBuckets(
    source.labels,
    [{ label: 'Gain', data: source.gain }, { label: 'Bets', data: source.bets }],
    dateFrom,
    dateTo,
    'day',
  ), [source, dateFrom, dateTo]);

  const chartData = useMemo(() => ({
    labels: filtered.labels,
    datasets: [
      ds('bar', 0, filtered.datasets[0]?.data || [], { label: 'Gain', borderWidth: 1 }),
      ds('bar', 1, filtered.datasets[1]?.data || [], { label: 'Bets', borderWidth: 1 }),
    ],
  }), [ds, filtered]);

  return (
    <div className="my-4">
      <h5 style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChart(previous => !previous)} title="Click to show/hide chart">Slots Results</h5>
      {loading ? (
        <div><img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: '80px' }} /></div>
      ) : error || filtered.labels.length === 0 ? (
        <div role="status">{error || 'No slot results available for this range.'}</div>
      ) : showChart ? (
        <div style={{ height: chartHeight }}>
          <Bar data={chartData} options={themedOptions({
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true }, title: { display: false }, tooltip: { enabled: true } },
            scales: {
              x: { title: { display: true, text: 'Day' }, type: 'category' },
              y: { title: { display: true, text: 'Amount' }, beginAtZero: true, type: 'linear' },
            },
          })} />
        </div>
      ) : null}
    </div>
  );
}
