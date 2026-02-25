import { useCallback, useEffect, useRef, useState } from 'react';

function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatSignedUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  return `${sign}${formatUsd(abs)}`;
}

function getSetComparison(setPriceRaw, pointPriceRaw, pointsCount) {
  const setPrice = Number(setPriceRaw);
  const pointPrice = Number(pointPriceRaw);
  if (!Number.isFinite(setPrice) || !Number.isFinite(pointPrice)) return null;
  const equivalent = pointPrice * pointsCount;
  const diff = setPrice - equivalent;
  return { equivalent, diff, profitable: diff > 0 };
}

export default function Museum({ wsStatus, wsMessages = [], sendWs, darkMode }) {
  const [pointPending, setPointPending] = useState(false);
  const [pointResult, setPointResult] = useState(null);
  const [pointError, setPointError] = useState('');
  const lastPointProcessedIndexRef = useRef(0);
  const autoRequestedRef = useRef(false);

  const handlePointPriceRefresh = useCallback(() => {
    if (wsStatus !== 'open') {
      setPointError('WebSocket is not connected.');
      return;
    }

    setPointPending(true);
    setPointError('');
    lastPointProcessedIndexRef.current = wsMessages.length;

    try {
      sendWs(JSON.stringify({ type: 'pointPrice' }));
    } catch (e) {
      setPointPending(false);
      setPointError(e && e.message ? e.message : 'Failed to send request.');
    }
  }, [sendWs, wsMessages.length, wsStatus]);

  useEffect(() => {
    if (lastPointProcessedIndexRef.current === wsMessages.length) return;

    for (let i = lastPointProcessedIndexRef.current; i < wsMessages.length; i += 1) {
      const raw = wsMessages[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || typeof parsed !== 'object') continue;
      if (parsed.type !== 'pointPrice') continue;

      setPointPending(false);
      setPointResult(parsed);
      if (parsed.ok === false) setPointError(parsed.error || 'Request failed');
      else setPointError('');
    }

    lastPointProcessedIndexRef.current = wsMessages.length;
  }, [wsMessages]);

  useEffect(() => {
    if (wsStatus !== 'open') {
      setPointPending(false);
      autoRequestedRef.current = false;
      return;
    }
    if (autoRequestedRef.current) return;
    autoRequestedRef.current = true;
    handlePointPriceRefresh();
  }, [handlePointPriceRefresh, wsStatus]);

  const senetComparison = getSetComparison(
    pointResult && pointResult.senetSetPrice,
    pointResult && pointResult.minPrice,
    2000,
  );
  const quranComparison = getSetComparison(
    pointResult && pointResult.quranScriptSetPrice,
    pointResult && pointResult.minPrice,
    1000,
  );
  const flowerComparison = getSetComparison(
    pointResult && pointResult.flowerSetPrice,
    pointResult && pointResult.minPrice,
    10,
  );
  const coinComparison = getSetComparison(
    pointResult && pointResult.coinSetPrice,
    pointResult && pointResult.minPrice,
    100,
  );

  const positiveColor = darkMode ? '#64d88a' : '#1f8f49';
  const negativeColor = darkMode ? '#ff6f6f' : '#cc2a2a';

  return (
    <div className="mt-2">
      <h5 className="mb-3">Museum</h5>
      <div
        style={{
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: 6,
          padding: 12,
          background: darkMode ? '#121212' : '#fff',
        }}
      >
        <div className="d-flex align-items-start justify-content-between flex-wrap" style={{ gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>Point Price</div>
            <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
              {formatUsd(pointResult && pointResult.minPrice)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pointPending || wsStatus !== 'open'}
            onClick={handlePointPriceRefresh}
          >
            {pointPending ? 'Refreshing...' : 'Refresh Price'}
          </button>
        </div>
        <div
          className="mt-3"
          style={{
            borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#eee'}`,
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>
            Plushies 10 Points Price
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
            {formatUsd(pointResult && pointResult.plushies10PointsPrice)}
          </div>
        </div>
        <div
          className="mt-3"
          style={{
            borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#eee'}`,
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>
            Senet Set Price
          </div>
          <div className="d-flex align-items-baseline flex-wrap" style={{ gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
              {formatUsd(pointResult && pointResult.senetSetPrice)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: senetComparison
                  ? (senetComparison.profitable ? positiveColor : negativeColor)
                  : (darkMode ? '#aaa' : '#666'),
              }}
            >
              {senetComparison
                ? `vs 2000 pts (${formatUsd(senetComparison.equivalent)}): ${formatSignedUsd(senetComparison.diff)}`
                : 'vs 2000 pts: -'}
            </div>
          </div>
        </div>
        <div
          className="mt-3"
          style={{
            borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#eee'}`,
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>
            Quran Scripts Set Price
          </div>
          <div className="d-flex align-items-baseline flex-wrap" style={{ gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
              {formatUsd(pointResult && pointResult.quranScriptSetPrice)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: quranComparison
                  ? (quranComparison.profitable ? positiveColor : negativeColor)
                  : (darkMode ? '#aaa' : '#666'),
              }}
            >
              {quranComparison
                ? `vs 1000 pts (${formatUsd(quranComparison.equivalent)}): ${formatSignedUsd(quranComparison.diff)}`
                : 'vs 1000 pts: -'}
            </div>
          </div>
        </div>
        <div
          className="mt-3"
          style={{
            borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#eee'}`,
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>
            Flower Set Price
          </div>
          <div className="d-flex align-items-baseline flex-wrap" style={{ gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
              {formatUsd(pointResult && pointResult.flowerSetPrice)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: flowerComparison
                  ? (flowerComparison.profitable ? positiveColor : negativeColor)
                  : (darkMode ? '#aaa' : '#666'),
              }}
            >
              {flowerComparison
                ? `vs 10 pts (${formatUsd(flowerComparison.equivalent)}): ${formatSignedUsd(flowerComparison.diff)}`
                : 'vs 10 pts: -'}
            </div>
          </div>
        </div>
        <div
          className="mt-3"
          style={{
            borderTop: `1px solid ${darkMode ? '#2a2a2a' : '#eee'}`,
            paddingTop: 10,
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', opacity: 0.75 }}>
            Coin Set Price
          </div>
          <div className="d-flex align-items-baseline flex-wrap" style={{ gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
              {formatUsd(pointResult && pointResult.coinSetPrice)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: coinComparison
                  ? (coinComparison.profitable ? positiveColor : negativeColor)
                  : (darkMode ? '#aaa' : '#666'),
              }}
            >
              {coinComparison
                ? `vs 100 pts (${formatUsd(coinComparison.equivalent)}): ${formatSignedUsd(coinComparison.diff)}`
                : 'vs 100 pts: -'}
            </div>
          </div>
        </div>
        <div className="mt-2" style={{ fontSize: 13 }}>
          <strong>WS:</strong> {wsStatus}
          {pointResult && pointResult.time ? (
            <span> | <strong>Updated:</strong> {new Date(pointResult.time).toLocaleString()}</span>
          ) : null}
        </div>
      </div>
      {pointError ? (
        <div className="alert alert-danger py-2 mt-2 mb-0">{pointError}</div>
      ) : null}
    </div>
  );
}
