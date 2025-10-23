import React, { useMemo, useState, Suspense, lazy, useEffect } from 'react';
import { useTheme } from './hooks/themeContext.js';
import useAppWebSocket from './hooks/useAppWebSocket.js';
import useBazaarAlerts from './hooks/useBazaarAlerts.js';

const BazaarTable = lazy(() => import('./BazaarTable.jsx'));
const DailyPriceAveragesChart = lazy(() => import('./DailyPriceAveragesChart.jsx'));
const Autocomplete = lazy(() => import('./Autocomplete.jsx'));

export default function PublicBazaarPage() {
  const { darkMode } = useTheme();
  // Open public bazaar WS (no auth required)
  const wsb = useAppWebSocket('/wsb', 'public');
  // Open main WS for charts (will be unauthorized for protected data, acceptable for public view)
  const ws = useAppWebSocket('/ws', 'public');

  const {
    watchedItems,
    setWatchedItems,
    priceThresholds,
    setPriceThresholds,
    bazaarRows,
    blinkingItems
  } = useBazaarAlerts(wsb.messages);

  // Minimal date range state for the chart
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const onMinDate = useMemo(() => (d) => {
    if (!d) return;
    setDateFrom(prev => prev ?? d);
    // dateTo stays null -> chart uses max data date
  }, []);

  // ESC to close modal
  useEffect(() => {
    if (!showAutocomplete) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowAutocomplete(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAutocomplete]);

  return (
    <div className={`app-root ${darkMode ? 'dark-mode' : 'light-mode'}`} style={{ minHeight: '100vh', padding: 12 }}>
      <div className="container-fluid" style={{ maxWidth: 1400 }}>
        <h5 style={{ marginTop: 8, marginBottom: 16 }}>Public Market View</h5>
        <Suspense fallback={<div style={{ padding: 20 }}>Loading market…</div>}>
          <BazaarTable
            bazaarRows={bazaarRows}
            watchedItems={watchedItems}
            priceThresholds={priceThresholds}
            blinkingItems={blinkingItems}
            onThresholdChange={(itemId, value) => {
              setPriceThresholds(prev => {
                const updated = { ...prev, [itemId]: value };
                try { localStorage.setItem('priceThresholds', JSON.stringify(updated)); } catch(_) {}
                return updated;
              });
            }}
            onUnwatch={(itemId) => {
              try { wsb.send(JSON.stringify({ type: 'unwatch', itemId })); } catch(_) {}
              setWatchedItems(prev => prev.filter(id => id !== itemId));
            }}
          />
        </Suspense>

        <div style={{ marginTop: 24 }}>
          <Suspense fallback={<div style={{ padding: 20 }}>Loading chart…</div>}>
            <DailyPriceAveragesChart
              wsMessages={ws.messages}
              sendWs={ws.send}
              wsStatus={ws.status}
              darkMode={darkMode}
              onMinDate={onMinDate}
              dateFrom={dateFrom}
              dateTo={dateTo}
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
            style={{ background:'rgba(0,0,0,0.5)' }}
          >
            <div
              className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
              onClick={(e) => e.stopPropagation()}
              style={{ height: '50vh' }}
            >
              <div className="modal-content" style={{ ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0', border:'1px solid #2a2a2a' } : {}), height: '100%' }}>
                <div className="modal-header">
                  <h6 className="modal-title">Watch Items</h6>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowAutocomplete(false)} />
                </div>
                <div className="modal-body">
                  <Suspense fallback={<div style={{ padding: 20 }}>Loading items…</div>}>
                    <Autocomplete
                      token="public"
                      watchedItems={watchedItems}
                      onWatch={(itemId) => {
                        try { wsb.send(JSON.stringify({ type:'watch', itemId })); } catch {}
                        setWatchedItems(prev => (prev.includes(itemId) ? prev : [...prev, itemId]));
                      }}
                      onUnwatch={(itemId) => {
                        try { wsb.send(JSON.stringify({ type:'unwatch', itemId })); } catch {}
                        setWatchedItems(prev => prev.filter(id => id !== itemId));
                      }}
                      sendWs={ws.send}
                      wsMessages={ws.messages}
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
