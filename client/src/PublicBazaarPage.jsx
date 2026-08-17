import React, { useMemo, useState, Suspense, lazy, useEffect, useRef } from 'react';
import { useTheme } from './hooks/themeContext.js';
import useAppWebSocket from './hooks/useAppWebSocket.js';
import useBazaarAlerts from './hooks/useBazaarAlerts.js';

const BazaarTable = lazy(() => import('./BazaarTable.jsx'));
const DailyPriceAveragesChart = lazy(() => import('./DailyPriceAveragesChart.jsx'));
const Autocomplete = lazy(() => import('./Autocomplete.jsx'));

export default function PublicBazaarPage() {
  const { darkMode } = useTheme();
  // /wsb is the only connection used by this intentionally public view.
  const wsb = useAppWebSocket('/wsb', 'public');
  const sentSubscriptionsRef = useRef(new Set());

  const {
    watchedItems,
    setWatchedItems,
    priceThresholds,
    setPriceThresholds,
    bazaarRows,
    blinkingItems,
  } = useBazaarAlerts(wsb.messages);

  // Keep server subscriptions aligned with the locally persisted watch set.
  useEffect(() => {
    if (wsb.status !== 'open') {
      sentSubscriptionsRef.current.clear();
      return;
    }
    const desired = new Set(watchedItems);
    for (const itemId of desired) {
      if (sentSubscriptionsRef.current.has(itemId)) continue;
      wsb.send(JSON.stringify({ type: 'watch', itemId }));
      sentSubscriptionsRef.current.add(itemId);
    }
    for (const itemId of Array.from(sentSubscriptionsRef.current)) {
      if (desired.has(itemId)) continue;
      wsb.send(JSON.stringify({ type: 'unwatch', itemId }));
      sentSubscriptionsRef.current.delete(itemId);
    }
  }, [watchedItems, wsb.send, wsb.status]);

  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const onMinDate = useMemo(() => (date) => {
    if (!date) return;
    setDateFrom(previous => previous ?? date);
  }, []);

  useEffect(() => {
    if (!showAutocomplete) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setShowAutocomplete(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAutocomplete]);

  const watchItem = (itemId) => {
    setWatchedItems(previous => (previous.includes(itemId) ? previous : [...previous, itemId]));
    if (wsb.status === 'open') {
      wsb.send(JSON.stringify({ type: 'watch', itemId }));
      sentSubscriptionsRef.current.add(itemId);
    }
  };

  const unwatchItem = (itemId) => {
    setWatchedItems(previous => previous.filter(id => id !== itemId));
    if (wsb.status === 'open') {
      wsb.send(JSON.stringify({ type: 'unwatch', itemId }));
      sentSubscriptionsRef.current.delete(itemId);
    }
  };

  return (
    <div className={`app-root ${darkMode ? 'dark-mode' : 'light-mode'}`} style={{ minHeight: '100vh', padding: 12 }}>
      <div className="container-fluid" style={{ maxWidth: 1400 }}>
        <h5 style={{ marginTop: 8, marginBottom: 16 }}>Public Market View</h5>
        {wsb.status !== 'open' && (
          <div role="status" style={{ marginBottom: 12, color: '#856404' }}>
            Public market stream unavailable. Retrying…
          </div>
        )}
        <Suspense fallback={<div style={{ padding: 20 }}>Loading market…</div>}>
          <BazaarTable
            bazaarRows={bazaarRows}
            watchedItems={watchedItems}
            priceThresholds={priceThresholds}
            blinkingItems={blinkingItems}
            onThresholdChange={(itemId, value) => {
              setPriceThresholds(previous => ({ ...previous, [itemId]: value }));
            }}
            onUnwatch={unwatchItem}
          />
        </Suspense>

        <div style={{ marginTop: 24 }}>
          <Suspense fallback={<div style={{ padding: 20 }}>Loading chart…</div>}>
            <DailyPriceAveragesChart
              wsMessages={wsb.messages}
              sendWs={wsb.send}
              wsStatus={wsb.status}
              darkMode={darkMode}
              onMinDate={onMinDate}
              dateFrom={dateFrom}
              dateTo={dateTo}
              allowBuild={false}
            />
          </Suspense>
        </div>

        <div className="d-flex justify-content-end" style={{ marginTop: 16 }}>
          <button
            className="btn btn-outline-secondary"
            onClick={() => setShowAutocomplete(true)}
          >
            Add/Remove Watched Items
          </button>
        </div>

        {showAutocomplete && (
          <div
            className="modal d-block"
            role="dialog"
            aria-modal="true"
            aria-label="Items chooser"
            onClick={() => setShowAutocomplete(false)}
            style={{ background: 'rgba(0,0,0,0.5)' }}
          >
            <div
              className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
              onClick={(event) => event.stopPropagation()}
              style={{ height: '50vh' }}
            >
              <div className="modal-content" style={{ ...(darkMode ? { background: '#1b1b1b', color: '#e0e0e0', border: '1px solid #2a2a2a' } : {}), height: '100%' }}>
                <div className="modal-header">
                  <h6 className="modal-title">Watch Items</h6>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowAutocomplete(false)} />
                </div>
                <div className="modal-body">
                  <Suspense fallback={<div style={{ padding: 20 }}>Loading items…</div>}>
                    <Autocomplete
                      token="public"
                      watchedItems={watchedItems}
                      onWatch={watchItem}
                      onUnwatch={unwatchItem}
                      sendWs={wsb.send}
                      wsMessages={wsb.messages}
                    />
                  </Suspense>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowAutocomplete(false)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
