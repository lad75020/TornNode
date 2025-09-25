import { useEffect, useState, useRef } from 'react';
import { getAllItemsFromIDB } from './syncItemsToIndexedDB.js';

import { refreshPriceViaWs, handleUpdatePriceMessage } from './UpdatePrice.jsx';


function Autocomplete({ token, onAuth, onWatch, onUnwatch, watchedItems = [], sendWs, wsMessages }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState([]);
  const [refreshingIds, setRefreshingIds] = useState(new Set());
  const lastClickRef = useRef(new Map()); // itemId -> timestamp

  // Initial load: read local IndexedDB then request fresh list via WebSocket
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const localItems = await getAllItemsFromIDB();
      if (!cancelled && localItems.length) {
        setItems(localItems);
        // Envoi différé uniquement si data locale trop ancienne (>10 min)
        const lastSync = parseInt(localStorage.getItem('itemsLastSync')||'0',10);
        const stale = Date.now() - lastSync > 10*60*1000;
        if (stale) { try { if (sendWs) sendWs(JSON.stringify({ type:'getAllTornItems' })); } catch {} }
      } else {
        // Pas de données locales → requête immédiate
        try { if (sendWs) sendWs(JSON.stringify({ type:'getAllTornItems' })); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [token, sendWs]);

  // Rafraîchir liste affichée si un sync externe a mis à jour IndexedDB (poll simple sur timestamp localStorage)
  useEffect(() => {
    if (!token) return;
    let lastSeen = localStorage.getItem('itemsLastSync');
    const id = setInterval(async () => {
      const cur = localStorage.getItem('itemsLastSync');
      if (cur && cur !== lastSeen) {
        lastSeen = cur;
        const localItems = await getAllItemsFromIDB();
        if (localItems.length) setItems(localItems);
      }
    }, 10000); // 10s
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    const q = (query || '').toLowerCase();
    setFiltered(
      items.filter(item => {
        const name = (item && typeof item.name === 'string') ? item.name : '';
        return name.toLowerCase().startsWith(q);
      })
    );
  }, [query, items]);

  // Écoute des messages WS pour updatePrice & getAllTornItems
  useEffect(() => {
    if (!wsMessages || !wsMessages.length) return;
    const last = wsMessages[wsMessages.length - 1];
    if (!last || last[0] !== '{') return;
    try {
      const parsed = JSON.parse(last);
      if (parsed.type === 'updatePrice') {
        if (parsed.ok && typeof parsed.id !== 'undefined' && typeof parsed.price === 'number') {
          setItems(prev => prev.map(it => it.id === parsed.id ? { ...it, price: parsed.price } : it));
        }
        // Mise à jour IDB asynchrone
        handleUpdatePriceMessage(parsed).catch(()=>{});
      } else if (parsed.type === 'getAllTornItems' && parsed.ok && Array.isArray(parsed.items)) {
        setItems(parsed.items);
      }
    } catch {}
  }, [wsMessages]);

  if (!token) {
    location.href = '/';
  }

  return (
    <div style={{ margin: 20 }}>
      
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher..."
        style={{ padding: 8, width: 200 }}
      />
      {query && (
        <ul style={{ color: 'black',border: '1px solid #ccc', padding: 0, margin: 0, width: 200, position: 'absolute', background: '#fff', zIndex: 1, maxHeight:300, overflowY:'auto' }}>
          {filtered.length === 0 && (
            <li style={{ listStyle:'none', padding:8, fontStyle:'italic', opacity:0.6 }}>Aucun résultat</li>
          )}
          {filtered.map(item => (
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
                {(item.name || ('#'+item.id)) + (item.price != null ? (' $'+ item.price) : '')}
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const now = Date.now();
                  const last = lastClickRef.current.get(item.id) || 0;
                  if (now - last < 2000) return; // debounce 2s
                  lastClickRef.current.set(item.id, now);
                  setRefreshingIds(prev => new Set(prev).add(item.id));
                  const p = refreshPriceViaWs(sendWs, item.id, { onSent: () => { /* hook futur */ } });
                  Promise.resolve(p).finally(() => {
                    setTimeout(() => setRefreshingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; }), 400);
                  });
                }}
                className="btn btn-link p-0 ms-2"
                style={{ textDecoration:'none' }}
                title="Rafraîchir le prix"
              >
                {refreshingIds.has(item.id) ? '⏳' : '🔄'}
              </button>
            </li>
          ))}
        </ul>
      )}
      
    </div>
  );
}

export default Autocomplete;