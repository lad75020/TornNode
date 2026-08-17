import { useEffect, useMemo, useRef, useState } from 'react';
import useChartTheme from './useChartTheme.js';
import { Pie } from 'react-chartjs-2';
import { toFiniteNumber } from './financeAnalytics.js';

const NETWORTH_PARTS = [
  ['Wallet', 'networthwallet'],
  ['Vault', 'networthvault'],
  ['Bank', 'networthbank'],
  ['Cayman', 'networthcayman'],
  ['Points', 'networthpoints'],
  ['Items', 'networthitems'],
  ['DisplayCase', 'networthdisplaycase'],
  ['Bazaar', 'networthbazaar'],
  ['ItemMarket', 'networthitemmarket'],
  ['Properties', 'networthproperties'],
  ['StockMarket', 'networthstockmarket'],
  ['Auction', 'networthauctionhouse'],
  ['Bookie', 'networthbookie'],
  ['Company', 'networthcompany'],
  ['EnlistedCars', 'networthenlistedcars'],
  ['PiggyBank', 'networthpiggybank'],
  ['Pending', 'networthpending'],
];

function parseMessage(message) {
  if (typeof message === 'string') {
    try { return JSON.parse(message); } catch (_) { return null; }
  }
  return message && typeof message === 'object' ? message : null;
}

function normalizeNetworth(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(NETWORTH_PARTS
    .map(([, key]) => [key, toFiniteNumber(value[key])])
    .filter(([, number]) => number !== null && number !== 0));
}

export default function NetworthPieChart({ wsRef, wsMessages = [], sendWs, darkMode, chartHeight = 420 }) {
  const { themedOptions, theme } = useChartTheme(darkMode);
  const [networth, setNetworth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestedRef = useRef(false);
  const processedMessageRef = useRef(null);

  useEffect(() => {
    const request = () => {
      if (typeof sendWs !== 'function') return;
      if (wsRef && wsRef.current && wsRef.current.readyState !== 1) return;
      try { sendWs('lastNetworth'); } catch (_) {
        setError('Latest networth could not be loaded. Please retry.');
        setLoading(false);
      }
    };
    if (!requestedRef.current) {
      requestedRef.current = true;
      request();
    }
    const interval = setInterval(request, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [wsRef, sendWs]);

  useEffect(() => {
    for (let index = wsMessages.length - 1; index >= 0; index -= 1) {
      const parsed = parseMessage(wsMessages[index]);
      if (!parsed || parsed.type !== 'lastNetworth') continue;
      const signature = JSON.stringify(parsed);
      if (processedMessageRef.current === signature) return;
      processedMessageRef.current = signature;
      if (parsed.error) {
        setNetworth(null);
        setError(String(parsed.error));
        setLoading(false);
        return;
      }
      const normalized = normalizeNetworth(parsed.networth);
      setNetworth(Object.keys(normalized).length ? normalized : null);
      setError(Object.keys(normalized).length ? null : 'Latest networth could not be loaded. Please retry.');
      setLoading(false);
      return;
    }
  }, [wsMessages]);

  const { data, total, sortedParts } = useMemo(() => {
    if (!networth) return { data: null, total: 0, sortedParts: [] };
    const parts = NETWORTH_PARTS
      .map(([label, key]) => ({ label, key, value: networth[key] }))
      .filter(part => Number.isFinite(part.value) && part.value > 0);
    const totalValue = parts.reduce((sum, part) => sum + part.value, 0);
    if (!parts.length || !Number.isFinite(totalValue) || totalValue <= 0) {
      return { data: null, total: 0, sortedParts: [] };
    }
    const threshold = totalValue * 0.01;
    const mainParts = [];
    let otherSum = 0;
    for (const part of parts) {
      if (part.value < threshold) otherSum += part.value;
      else mainParts.push(part);
    }
    if (otherSum > 0) mainParts.push({ label: 'Other', key: 'other', value: otherSum });
    mainParts.sort((left, right) => right.value - left.value);
    const labels = mainParts.map(part => part.label);
    const palette = theme.linePalette || [];
    const backgroundColor = labels.map((_, index) => palette[index % Math.max(palette.length, 1)] || '#8884d8');
    const borderColor = backgroundColor.map(color => color.replace(/0\.[0-9]+\)/, '1)'));
    return {
      total: totalValue,
      sortedParts: mainParts,
      data: {
        labels,
        datasets: [{ label: 'Networth distribution', data: mainParts.map(part => part.value), backgroundColor, borderColor, borderWidth: 1 }],
      },
    };
  }, [networth, theme]);

  const refresh = () => {
    try { sendWs?.('lastNetworth'); } catch (_) {
      setError('Latest networth could not be loaded. Please retry.');
    }
  };

  return (
    <div style={{ height: chartHeight, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="d-flex align-items-center justify-content-between mb-1">
        <h5 className="m-0" style={{ cursor: 'pointer', userSelect: 'none', fontSize: '1rem' }}>Networth Breakdown</h5>
        <button className="btn btn-outline-secondary btn-sm" onClick={refresh} title="Refresh">↻</button>
      </div>
      {loading ? (
        <div role="status">Loading...</div>
      ) : error || !data ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 8 }}>
          <div role="status">{error || 'No networth breakdown available.'}</div>
          <button className="btn btn-sm btn-outline-primary mt-2" onClick={refresh}>Refresh</button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Pie
              data={data}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                cutout: '55%',
                plugins: {
                  legend: { position: 'right', labels: { boxWidth: 14 } },
                  tooltip: { callbacks: { label: context => `${context.label}: ${context.parsed.toLocaleString()} (${((context.parsed / total) * 100).toFixed(1)}%)` } },
                  title: { display: true, text: `Total: ${total.toLocaleString()}` },
                },
              })}
            />
          </div>
          <div style={{ flex: '0 0 160px', overflowY: 'auto', fontSize: 12, marginTop: 4, borderTop: '1px solid rgba(128,128,128,0.25)' }}>
            <table className="table table-sm table-striped mb-0">
              <thead><tr><th>Part</th><th>Value</th><th>%</th></tr></thead>
              <tbody>{sortedParts.map(part => (
                <tr key={part.key}><td>{part.label}</td><td>{part.value.toLocaleString()}</td><td>{((part.value / total) * 100).toFixed(2)}%</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
