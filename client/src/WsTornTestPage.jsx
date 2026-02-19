import { useEffect, useRef, useState } from 'react';
import JsonPreview from './JsonPreview.jsx';

function toNowRange(secondsBack) {
  const to = Math.floor(Date.now() / 1000);
  const from = Math.max(0, to - Math.max(0, Number(secondsBack) || 0));
  return { from: String(from), to: String(to) };
}

export default function WsTornTestPage({ wsStatus, wsMessages = [], sendWs, darkMode }) {
  const initialRange = toNowRange(3600);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [pending, setPending] = useState(false);
  const [requestId, setRequestId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [statsCat, setStatsCat] = useState('all');
  const [statsPending, setStatsPending] = useState(false);
  const [statsRequestId, setStatsRequestId] = useState(null);
  const [statsResult, setStatsResult] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [companyPending, setCompanyPending] = useState(false);
  const [companyRequestId, setCompanyRequestId] = useState(null);
  const [companyResult, setCompanyResult] = useState(null);
  const [companyError, setCompanyError] = useState('');
  const [companyForceDetails, setCompanyForceDetails] = useState(false);
  const [pointPending, setPointPending] = useState(false);
  const [pointResult, setPointResult] = useState(null);
  const [pointError, setPointError] = useState('');
  const companyCollectorRef = useRef(null);
  const lastProcessedIndexRef = useRef(0);
  const lastPointProcessedIndexRef = useRef(0);

  useEffect(() => {
    if (!requestId && !statsRequestId && !companyRequestId) {
      lastProcessedIndexRef.current = wsMessages.length;
      return;
    }
    if (lastProcessedIndexRef.current === wsMessages.length) return;

    for (let i = lastProcessedIndexRef.current; i < wsMessages.length; i += 1) {
      const raw = wsMessages[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || typeof parsed !== 'object') continue;

      if (parsed.type === 'wsTornTestResult') {
        if (parsed.requestId && parsed.requestId !== requestId) continue;
        setPending(false);
        setResult(parsed);
        if (parsed.ok === false) setError(parsed.error || 'Request failed');
        else setError('');
      }

      if (parsed.type === 'wsStatsTestResult') {
        if (parsed.requestId && parsed.requestId !== statsRequestId) continue;
        setStatsPending(false);
        setStatsResult(parsed);
        if (parsed.ok === false) setStatsError(parsed.error || 'Request failed');
        else setStatsError('');
      }

      if (
        companyCollectorRef.current
        && (parsed.type === 'companyStock' || parsed.type === 'companyProfile' || parsed.type === 'companyDetails')
      ) {
        if (parsed.type === 'companyStock') companyCollectorRef.current.stock = parsed;
        if (parsed.type === 'companyProfile') companyCollectorRef.current.profile = parsed;
        if (parsed.type === 'companyDetails') companyCollectorRef.current.details = parsed;

        const collected = companyCollectorRef.current;
        if (collected.stock && collected.profile && collected.details) {
          const merged = {
            type: 'companyAll',
            requestId: companyRequestId,
            receivedAt: Date.now(),
            stock: collected.stock,
            profile: collected.profile,
            details: collected.details,
          };
          setCompanyPending(false);
          setCompanyResult(merged);
          if (collected.stock.ok === false || collected.profile.ok === false || collected.details.ok === false) {
            setCompanyError('One or more company requests failed.');
          } else {
            setCompanyError('');
          }
          companyCollectorRef.current = null;
        }
      }
    }

    lastProcessedIndexRef.current = wsMessages.length;
  }, [wsMessages, requestId, statsRequestId, companyRequestId]);

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
      setPending(false);
      setStatsPending(false);
      setCompanyPending(false);
      setPointPending(false);
    }
  }, [wsStatus]);

  const formatMoney = (value) => {
    if (!Number.isFinite(Number(value))) return '-';
    return `$${Math.round(Number(value)).toLocaleString()}`;
  };

  const handleCall = (event) => {
    event.preventDefault();
    const fromTs = Number(from);
    const toTs = Number(to);
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
      setError('from and to must be numbers (unix seconds).');
      return;
    }
    if (!Number.isInteger(fromTs) || !Number.isInteger(toTs)) {
      setError('from and to must be integers (unix seconds).');
      return;
    }
    if (fromTs > toTs) {
      setError('from must be <= to.');
      return;
    }
    if (wsStatus !== 'open') {
      setError('WebSocket is not connected.');
      return;
    }

    const nextRequestId = `wstorn_${Date.now().toString(36)}`;
    setRequestId(nextRequestId);
    setPending(true);
    setError('');
    setResult(null);
    lastProcessedIndexRef.current = wsMessages.length;

    try {
      sendWs(JSON.stringify({
        type: 'wsTornTest',
        from: fromTs,
        to: toTs,
        requestId: nextRequestId,
      }));
    } catch (e) {
      setPending(false);
      setError(e && e.message ? e.message : 'Failed to send request.');
    }
  };

  const handleStatsCall = (event) => {
    event.preventDefault();
    const cat = String(statsCat || '').trim();
    if (!cat) {
      setStatsError('cat is required.');
      return;
    }
    if (wsStatus !== 'open') {
      setStatsError('WebSocket is not connected.');
      return;
    }

    const nextRequestId = `wsstats_${Date.now().toString(36)}`;
    setStatsRequestId(nextRequestId);
    setStatsPending(true);
    setStatsError('');
    setStatsResult(null);
    lastProcessedIndexRef.current = wsMessages.length;

    try {
      sendWs(JSON.stringify({
        type: 'wsStatsTest',
        cat,
        requestId: nextRequestId,
      }));
    } catch (e) {
      setStatsPending(false);
      setStatsError(e && e.message ? e.message : 'Failed to send request.');
    }
  };

  const handleCompanyCall = (event) => {
    event.preventDefault();
    if (wsStatus !== 'open') {
      setCompanyError('WebSocket is not connected.');
      return;
    }

    const nextRequestId = `wscompany_${Date.now().toString(36)}`;
    setCompanyRequestId(nextRequestId);
    setCompanyPending(true);
    setCompanyError('');
    setCompanyResult(null);
    companyCollectorRef.current = { stock: null, profile: null, details: null };
    lastProcessedIndexRef.current = wsMessages.length;

    try {
      sendWs(JSON.stringify({ type: 'companyStock' }));
      sendWs(JSON.stringify({ type: 'companyProfile' }));
      sendWs(JSON.stringify({
        type: 'companyDetails',
        ...(companyForceDetails ? { force: true } : {}),
      }));
    } catch (e) {
      setCompanyPending(false);
      companyCollectorRef.current = null;
      setCompanyError(e && e.message ? e.message : 'Failed to send request.');
    }
  };

  const handlePointPriceRefresh = () => {
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
  };

  const responseValue = result
    ? (result.ok ? result.response : result)
    : { info: 'Submit a request to render Torn API JSON response.' };
  const statsResponseValue = statsResult
    ? (statsResult.ok ? statsResult.response : statsResult)
    : { info: 'Submit a request to render Stats API JSON response.' };
  const companyResponseValue = companyResult
    ? companyResult
    : { info: 'Submit a request to render all company API JSON responses (stock/profile/details).' };

  const logsCount = result && result.ok && result.response && Array.isArray(result.response.log)
    ? result.response.log.length
    : null;

  return (
    <div className="mt-2">
      <h5 className="mb-3">wsTorn Dry Run Test</h5>
      <form className="row g-2 align-items-end mb-3" onSubmit={handleCall}>
        <div className="col-auto">
          <label className="form-label mb-1" htmlFor="ws-torn-from">From (unix sec)</label>
          <input
            id="ws-torn-from"
            type="number"
            className="form-control form-control-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="col-auto">
          <label className="form-label mb-1" htmlFor="ws-torn-to">To (unix sec)</label>
          <input
            id="ws-torn-to"
            type="number"
            className="form-control form-control-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="col-auto d-flex" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              const r = toNowRange(3600);
              setFrom(r.from);
              setTo(r.to);
            }}
          >
            Last 1h
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={pending || wsStatus !== 'open'}
          >
            {pending ? 'Loading...' : 'Call wsTorn'}
          </button>
        </div>
      </form>

      <div className="mb-2" style={{ fontSize: 13 }}>
        <strong>WS:</strong> {wsStatus}
        {requestId ? <span> | <strong>Request:</strong> {requestId}</span> : null}
        {logsCount != null ? <span> | <strong>log[]:</strong> {logsCount}</span> : null}
      </div>

      {error ? (
        <div className="alert alert-danger py-2">{error}</div>
      ) : null}

      <div
        style={{
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: 6,
          padding: 10,
          maxHeight: '70vh',
          overflow: 'auto',
          background: darkMode ? '#121212' : '#fff',
        }}
      >
        <JsonPreview value={responseValue} className="json-preview" style={{ fontSize: 13 }} />
      </div>

      <hr className="my-4" />

      <h5 className="mb-3">ws Stats DryRun Test</h5>
      <form className="row g-2 align-items-end mb-3" onSubmit={handleStatsCall}>
        <div className="col-auto">
          <label className="form-label mb-1" htmlFor="ws-stats-cat">Cat (required)</label>
          <input
            id="ws-stats-cat"
            type="text"
            className="form-control form-control-sm"
            value={statsCat}
            onChange={(e) => setStatsCat(e.target.value)}
            placeholder="all"
          />
        </div>
        <div className="col-auto d-flex" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setStatsCat('all')}
          >
            Use all
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={statsPending || wsStatus !== 'open'}
          >
            {statsPending ? 'Loading...' : 'Call wsStats'}
          </button>
        </div>
      </form>

      <div className="mb-2" style={{ fontSize: 13 }}>
        <strong>WS:</strong> {wsStatus}
        {statsRequestId ? <span> | <strong>Request:</strong> {statsRequestId}</span> : null}
      </div>

      {statsError ? (
        <div className="alert alert-danger py-2">{statsError}</div>
      ) : null}

      <div
        style={{
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: 6,
          padding: 10,
          maxHeight: '70vh',
          overflow: 'auto',
          background: darkMode ? '#121212' : '#fff',
        }}
      >
        <JsonPreview value={statsResponseValue} className="json-preview" style={{ fontSize: 13 }} />
      </div>

      <hr className="my-4" />

      <h5 className="mb-3">ws Company All-in-One Test</h5>
      <form className="row g-2 align-items-end mb-3" onSubmit={handleCompanyCall}>
        <div className="col-auto">
          <div className="form-check">
            <input
              id="ws-company-force-details"
              className="form-check-input"
              type="checkbox"
              checked={companyForceDetails}
              onChange={(e) => setCompanyForceDetails(!!e.target.checked)}
            />
            <label className="form-check-label" htmlFor="ws-company-force-details">
              Force companyDetails fetch
            </label>
          </div>
        </div>
        <div className="col-auto d-flex" style={{ gap: 8 }}>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={companyPending || wsStatus !== 'open'}
          >
            {companyPending ? 'Loading...' : 'Load Company Data'}
          </button>
        </div>
      </form>

      <div className="mb-2" style={{ fontSize: 13 }}>
        <strong>WS:</strong> {wsStatus}
        {companyRequestId ? <span> | <strong>Request:</strong> {companyRequestId}</span> : null}
      </div>

      {companyError ? (
        <div className="alert alert-danger py-2">{companyError}</div>
      ) : null}

      <div
        style={{
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: 6,
          padding: 10,
          maxHeight: '70vh',
          overflow: 'auto',
          background: darkMode ? '#121212' : '#fff',
        }}
      >
        <JsonPreview value={companyResponseValue} className="json-preview" style={{ fontSize: 13 }} />
      </div>

      <hr className="my-4" />

      <h5 className="mb-3">Point Price vs Plushies (10 points)</h5>
      <div className="row g-2 align-items-end mb-3">
        <div className="col-auto d-flex" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pointPending || wsStatus !== 'open'}
            onClick={handlePointPriceRefresh}
          >
            {pointPending ? 'Loading...' : 'Refresh Point Price'}
          </button>
        </div>
      </div>

      <div className="mb-2" style={{ fontSize: 13 }}>
        <strong>WS:</strong> {wsStatus}
        {pointResult && pointResult.time ? (
          <span> | <strong>Updated:</strong> {new Date(pointResult.time).toLocaleString()}</span>
        ) : null}
      </div>

      {pointError ? (
        <div className="alert alert-danger py-2">{pointError}</div>
      ) : null}

      <div
        style={{
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          borderRadius: 6,
          padding: 10,
          background: darkMode ? '#121212' : '#fff',
          fontSize: 14,
        }}
      >
        <div><strong>Points market (10 points):</strong> {formatMoney(pointResult && pointResult.pointsMarket10PointsPrice)}</div>
        <div><strong>Plushies total (10 points):</strong> {formatMoney(pointResult && pointResult.plushies10PointsPrice)}</div>
      </div>
    </div>
  );
}
