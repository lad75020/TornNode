import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { filterDatasetsByDate } from './dateFilterUtil.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import useChartTheme from './useChartTheme.js';

export default function BountyRewardChart({ logsUpdated, darkMode, chartHeight = 400, dateFrom, dateTo, onMinDate }) {
  const [data, setData] = useState({ labels: [], counts: [], rewards: [] });
  const [showChart, setShowChart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState('day'); // 'day' | 'week' | 'month'
  const { themedOptions, ds } = useChartTheme(darkMode);

  useEffect(() => {
    let canceled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const all = await getLogsByLogId(6710);
        if (canceled) return;
        const buckets = {}; // key -> { count, rewardSum, sortKey }

        function addToBucket(key, sortKey, reward) {
          if (!buckets[key]) buckets[key] = { count: 0, rewardSum: 0, sortKey };
          buckets[key].count += 1;
          buckets[key].rewardSum += reward;
        }

        function getISOWeek(date) {
          const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
          const dayNum = tmp.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
          tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
          return { year: tmp.getUTCFullYear(), week };
        }

        for (const obj of all) {
          const ts = Number(obj?.timestamp);
          if (!Number.isFinite(ts)) continue;
          const reward = Number(obj?.data?.bounty_reward ?? 0) || 0;
          const d = new Date(ts * 1000);
          if (granularity === 'day') {
            const key = d.toISOString().slice(0, 10);
            const sortKey = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
            addToBucket(key, sortKey, reward);
          } else if (granularity === 'week') {
            const { year, week } = getISOWeek(d);
            const key = `${year}-W${String(week).padStart(2, '0')}`;
            const simple = new Date(Date.UTC(year, 0, 4));
            const dayOfWeek = simple.getUTCDay() || 7;
            const week1Monday = new Date(simple);
            week1Monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
            const weekStart = new Date(week1Monday);
            weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
            const sortKey = weekStart.getTime();
            addToBucket(key, sortKey, reward);
          } else if (granularity === 'month') {
            const year = d.getUTCFullYear();
            const month = d.getUTCMonth();
            const key = `${year}-${String(month + 1).padStart(2, '0')}`;
            const sortKey = Date.UTC(year, month, 1);
            addToBucket(key, sortKey, reward);
          }
        }

        let labels = [];
        let counts = [];
        let rewards = [];
        const entries = Object.entries(buckets).map(([k, v]) => ({ key: k, ...v }));
        entries.sort((a, b) => a.sortKey - b.sortKey);

        if (entries.length === 0) {
          labels = [];
          counts = [];
          rewards = [];
        } else if (granularity === 'day') {
          let current = new Date(entries[0].sortKey);
          const end = new Date(entries[entries.length - 1].sortKey);
          while (current.getTime() <= end.getTime()) {
            const key = current.toISOString().slice(0, 10);
            labels.push(key);
            counts.push(buckets[key] ? buckets[key].count : 0);
            rewards.push(buckets[key] ? buckets[key].rewardSum : 0);
            current.setUTCDate(current.getUTCDate() + 1);
          }
        } else if (granularity === 'week') {
          const endMonday = new Date(entries[entries.length - 1].sortKey);
          let startMonday = new Date(entries[0].sortKey);
          startMonday.setUTCHours(0, 0, 0, 0);
          function isoLabelFromDate(monday) {
            const { year, week } = getISOWeek(monday);
            return `${year}-W${String(week).padStart(2, '0')}`;
          }
          while (startMonday.getTime() <= endMonday.getTime()) {
            const label = isoLabelFromDate(startMonday);
            labels.push(label);
            counts.push(buckets[label] ? buckets[label].count : 0);
            rewards.push(buckets[label] ? buckets[label].rewardSum : 0);
            startMonday.setUTCDate(startMonday.getUTCDate() + 7);
          }
        } else if (granularity === 'month') {
          let cursor = new Date(entries[0].sortKey);
          const end = new Date(entries[entries.length - 1].sortKey);
          while (cursor.getTime() <= end.getTime()) {
            const label = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
            labels.push(label);
            counts.push(buckets[label] ? buckets[label].count : 0);
            rewards.push(buckets[label] ? buckets[label].rewardSum : 0);
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
            cursor.setUTCDate(1);
          }
        }

        if (!canceled) {
          if (labels.length && granularity === 'day' && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
            try { onMinDate(labels[0]); } catch { /* ignore */ }
          }
          setData({ labels, counts, rewards });
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load bounty reward data', err);
        if (!canceled) {
          setData({ labels: [], counts: [], rewards: [] });
          setLoading(false);
        }
      }
    }
    fetchData();
    return () => { canceled = true; };
  }, [logsUpdated, granularity]);

  const filtered = (() => {
    const { labels, datasets } = filterDatasetsByDate(
      data.labels,
      [
        { label: 'Count', data: data.counts },
        { label: 'Bounty Reward', data: data.rewards },
      ],
      dateFrom,
      dateTo
    );
    return {
      labels,
      counts: datasets[0].data,
      rewards: datasets[1].data,
    };
  })();

  const rewardSeries = computeSeries(filtered.rewards);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Bounties (log 6710) per {granularity}
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <div style={{ display: 'flex', gap: 8, height: chartHeight }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="btn-group-vertical" role="group" aria-label="Granularity">
                <button type="button" className={`btn btn-sm ${granularity === 'day' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('day')}>Daily</button>
                <button type="button" className={`btn btn-sm ${granularity === 'week' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('week')}>Weekly</button>
                <button type="button" className={`btn btn-sm ${granularity === 'month' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setGranularity('month')}>Monthly</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Bar
                data={{
                  labels: filtered.labels,
                  datasets: [
                    ds('bar', 0, filtered.counts, { label: 'Entries', yAxisID: 'y', borderWidth: 1 }),
                    ds('line', 1, rewardSeries.cumulative, { label: 'Cumulative bounty_reward', yAxisID: 'y1', fill: false, tension: 0.15, pointRadius: 2 }),
                  ],
                }}
                options={themedOptions({
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: { display: true },
                    title: { display: false },
                    tooltip: {
                      callbacks: {
                        label(ctx) {
                          const dsLabel = ctx.dataset.label || '';
                          return `${dsLabel}: ${ctx.parsed.y?.toLocaleString?.() ?? ctx.parsed.y}`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: { title: { display: true, text: 'Timestamp' } },
                    y: { title: { display: true, text: 'Count' }, beginAtZero: true },
                    y1: { position: 'right', title: { display: true, text: 'Cumulative bounty_reward' }, beginAtZero: true, grid: { drawOnChartArea: false } },
                  },
                })}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
