import { useEffect, useState, useRef } from 'react';
import {
  getAllItemsFromIDB,
  isCompleteItem,
  isItemsCatalogStale,
  normalizeItemId,
  writeItemsToIndexedDB,
} from './syncItemsToIndexedDB.js';

import { refreshPriceViaWs, handleUpdatePriceMessage } from './UpdatePrice.jsx';
import useWsMessageBus from './hooks/useWsMessageBus.js';

const SAFE_CATALOG_ERROR = 'Item catalog could not be loaded. Please retry.';
const SAFE_PRICE_ERROR = 'Item price could not be updated. Please retry.';

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function safeServerError(value, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const knownSafeErrors = new Set([SAFE_CATALOG_ERROR, SAFE_PRICE_ERROR]);
  return knownSafeErrors.has(normalized) ? normalized : fallback;
}

function Autocomplete({ token, onAuth, onWatch, onUnwatch, watchedItems = [], sendWs, wsMessages, filterType = '' }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const [catalogError, setCatalogError] = useState('');
  const lastClickRef = useRef(new Map()); // itemId -> timestamp
  const catalogRequestRef = useRef(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Initial load: use the committed local snapshot, then request only when
  // the snapshot is missing or older than the shared ten-minute policy.
  useEffect(() => {
    if (!token) {
      catalogRequestRef.current = false;
      return undefined;
    }
    let cancelled = false;
    const requestCatalog = () => {
      if (catalogRequestRef.current) return;
      if (typeof sendWs !== 'function') {
        setCatalogError(SAFE_CATALOG_ERROR);
        return;
      }
      catalogRequestRef.current = true;
      setCatalogError('');
      try {
        sendWs(JSON.stringify({ type: 'getAllTornItems' }));
      } catch (_) {
        catalogRequestRef.current = false;
        setCatalogError(SAFE_CATALOG_ERROR);
      }
    };

    (async () => {
      const localItems = await getAllItemsFromIDB();
      if (cancelled) return;
      const validLocalItems = localItems.filter(isCompleteItem);
      if (validLocalItems.length > 0) setItems(validLocalItems);
      if (validLocalItems.length === 0 || isItemsCatalogStale()) requestCatalog();
    })().catch(() => {
      if (!cancelled) {
        catalogRequestRef.current = false;
        setCatalogError(SAFE_CATALOG_ERROR);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, sendWs]);

  // Refresh the committed snapshot after another tab advances itemsLastSync.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const onStorage = async (ev) => {
      if (ev.key !== 'itemsLastSync') return;
      const localItems = await getAllItemsFromIDB();
      if (cancelled) return;
      const validLocalItems = localItems.filter(isCompleteItem);
      if (validLocalItems.length > 0) {
        setItems(validLocalItems);
        setCatalogError('');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, [token]);

  // Debounce input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery((query || '').toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    // If a type is selected, show all items of that type (ignore query)
    const t = (filterType || '').trim();
    if (t) {
      const out = items.filter(it => (it && typeof it.type === 'string' && it.type.trim() === t));
      setFiltered(out);
      return;
    }
    // Otherwise, fall back to query-based filtering
    const q = debouncedQuery;
    if (!q) {
      setFiltered(items.slice(0, 300));
      return;
    }
    const out = items.filter(item => {
      const name = (item && typeof item.name === 'string') ? item.name : '';
      return name.toLowerCase().startsWith(q);
    });
    setFiltered(out);
  }, [debouncedQuery, items, filterType]);

  // Écoute des messages WS via bus
  useWsMessageBus(wsMessages, {
    onUpdatePrice: (parsed) => {
      const normalizedId = normalizeItemId(parsed && parsed.id);
      if (parsed && parsed.ok && normalizedId !== null && validPrice(parsed.price)) {
        setItems(prev => prev.map(it => (
          normalizeItemId(it.id) === normalizedId ? { ...it, price: parsed.price } : it
        )));
        setCatalogError('');
      } else if (parsed && parsed.type === 'updatePrice' && parsed.ok === false) {
        setCatalogError(safeServerError(parsed.error, SAFE_PRICE_ERROR));
      }
      handleUpdatePriceMessage(parsed).catch(() => {});
    },
    onGetAllTornItems: async (parsed) => {
      catalogRequestRef.current = false;
      if (!parsed || parsed.ok !== true || !Array.isArray(parsed.items)) {
        setCatalogError(safeServerError(parsed && parsed.error, SAFE_CATALOG_ERROR));
        return;
      }
      const validItems = parsed.items.filter(isCompleteItem);
      if (validItems.length === 0 || validItems.length !== parsed.items.length) {
        setCatalogError(SAFE_CATALOG_ERROR);
        return;
      }
      const result = await writeItemsToIndexedDB(validItems);
      if (result.error || result.preserved) {
        setCatalogError(SAFE_CATALOG_ERROR);
        return;
      }
      setItems(validItems);
      setCatalogError('');
    },
  });

  if (!token) {
    location.href = '/';
  }

  return (
    <div style={{ margin: 20 }}>
      {catalogError && (
        <div role="alert" style={{ color: '#842029', marginBottom: 8 }}>
          {catalogError}
        </div>
      )}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher..."
        style={{ padding: 8, width: 200 }}
      />
      {(query || (filterType && filterType.trim())) && (
        <ul style={{ color: 'black', border: '1px solid #ccc', padding: 0, margin: 0, width: 200, position: 'absolute', background: '#fff', zIndex: 2000, maxHeight: 300, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <li style={{ listStyle: 'none', padding: 8, fontStyle: 'italic', opacity: 0.6 }}>Aucun résultat</li>
          )}
          {(filterType ? filtered : filtered.slice(0, 300)).map(item => (
            <li
              key={item.id}
              style={{ listStyle: 'none', padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title={item.description || ''}
              onClick={() => {
                // Toggle watch via clic sur la ligne (améliore UX)
                if (watchedItems.includes(item.id)) {
                  onUnwatch && onUnwatch(item.id);
                } else {
                  onWatch && onWatch(item.id);
                }
              }}
            >
              <input
                type="checkbox"
                className="form-check-input me-2"
                checked={watchedItems.includes(item.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.checked) {
                    onWatch && onWatch(item.id);
                  } else {
                    onUnwatch && onUnwatch(item.id);
                  }
                }}
              />
              {item.img64 && (
                <img
                  src={`data:image/png;base64,${item.img64}`}
                  alt={item.name}
                  style={{ width: 32, height: 32, marginRight: 8, objectFit: 'contain', borderRadius: 4 }}
                />
              )}
              <span style={{ flex: 1 }}>
                {(item.name || ('#' + item.id)) + (item.price != null ? (' $' + item.price) : '')}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const now = Date.now();
                  const normalizedId = normalizeItemId(item.id);
                  const last = lastClickRef.current.get(normalizedId) || 0;
                  if (now - last < 2000) return; // debounce 2s
                  lastClickRef.current.set(normalizedId, now);
                  setCatalogError('');
                  setRefreshingIds(prev => new Set(prev).add(item.id));
                  const p = refreshPriceViaWs(sendWs, item.id, { onSent: () => { /* hook futur */ } });
                  Promise.resolve(p).catch(() => {
                    setCatalogError(SAFE_PRICE_ERROR);
                  }).finally(() => {
                    setTimeout(() => setRefreshingIds(prev => {
                      const n = new Set(prev);
                      n.delete(item.id);
                      return n;
                    }), 400);
                  });
                }}
                className="btn btn-link p-0 ms-2"
                style={{ textDecoration: 'none' }}
                title="Rafraîchir le prix"
              >
                {refreshingIds.has(item.id) ? '⏳' : '🔄'}
              </button>
            </li>
          ))}
          {!filterType && filtered.length > 300 && (
            <li style={{ listStyle: 'none', padding: 6, fontSize: 11, color: '#555' }}>Showing first 300 of {filtered.length}</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default Autocomplete;
