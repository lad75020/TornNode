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
  const lastProcessedIndexRef = useRef(0);

  useEffect(() => {
    if (!requestId) {
      lastProcessedIndexRef.current = wsMessages.length;
      return;
    }
    if (lastProcessedIndexRef.current === wsMessages.length) return;

    for (let i = lastProcessedIndexRef.current; i < wsMessages.length; i += 1) {
      const raw = wsMessages[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || parsed.type !== 'wsTornTestResult') continue;
      if (parsed.requestId && parsed.requestId !== requestId) continue;

      setPending(false);
      setResult(parsed);
      if (parsed.ok === false) {
        setError(parsed.error || 'Request failed');
      } else {
        setError('');
      }
    }

    lastProcessedIndexRef.current = wsMessages.length;
  }, [wsMessages, requestId]);

  useEffect(() => {
    if (wsStatus !== 'open') setPending(false);
  }, [wsStatus]);

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

  const responseValue = result
    ? (result.ok ? result.response : result)
    : { info: 'Submit a request to render Torn API JSON response.' };

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
    </div>
  );
}
