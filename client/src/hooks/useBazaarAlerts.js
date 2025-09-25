import { useEffect, useRef, useState } from 'react';
import usePersistentState from './usePersistentState.js';

function notifyPriceDrop(itemId, name, price, threshold) {
  if (typeof window === 'undefined') return;
  const body = `${name || itemId} à ${price.toLocaleString()} (≤ ${threshold.toLocaleString()})`;
  let delivered = false;
  if ('Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification('Bazaar: prix en baisse', { body, tag: 'bazaar-price-'+itemId });
        delivered = true;
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => { if (p === 'granted') { try { new Notification('Bazaar: prix en baisse', { body, tag: 'bazaar-price-'+itemId }); } catch {} } });
      }
    } catch {}
  }
  return delivered;
}

export default function useBazaarAlerts(wsBazaarMessages) {
  const [watchedItems, setWatchedItems] = usePersistentState('watchedItems', []);
  const [priceThresholds, setPriceThresholds] = usePersistentState('priceThresholds', {});
  const [bazaarRows, setBazaarRows] = useState([]);
  const [blinkingItems, setBlinkingItems] = useState(new Set());
  const thresholdsRef = useRef(priceThresholds);
  const triggeredRef = useRef(new Set());
  const localInitRef = useRef(true);

  useEffect(() => { thresholdsRef.current = priceThresholds; }, [priceThresholds]);

  useEffect(() => {
    if (!wsBazaarMessages.length) return;
    const last = wsBazaarMessages[wsBazaarMessages.length - 1];
    let payload;
    try { payload = JSON.parse(last); } catch { return; }
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'priceUpdate' && Array.isArray(payload.listings)) {
      const ts = payload.time || Date.now();
      const newRows = payload.listings.map(l => ({
        time: ts,
        itemId: payload.itemId,
        itemName: payload.itemName || '',
        price: l.price,
        quantity: l.quantity,
        seller: l.seller
      }));
      setBazaarRows(prev => {
        const incomingIds = new Set(newRows.map(r => r.itemId));
        const filtered = prev.filter(r => !incomingIds.has(r.itemId));
        return [...newRows, ...filtered];
      });
      newRows.forEach(r => {
        const threshold = Number(thresholdsRef.current[r.itemId] || 0);
        if (threshold > 0 && typeof r.price === 'number' && r.price <= threshold) {
          if (!triggeredRef.current.has(r.itemId)) {
            triggeredRef.current.add(r.itemId);
            setBlinkingItems(prev => { const s = new Set(prev); s.add(r.itemId); return s; });
            setTimeout(() => setBlinkingItems(prev => { const s = new Set(prev); s.delete(r.itemId); return s; }), 5000);
            notifyPriceDrop(r.itemId, r.itemName, r.price, threshold);
          }
        } else if (threshold > 0 && typeof r.price === 'number' && r.price > threshold) {
          if (triggeredRef.current.has(r.itemId)) triggeredRef.current.delete(r.itemId);
        }
      });
    } else if (payload.type === 'watchList' && Array.isArray(payload.items)) {
      // première synchro uniquement la première fois, sinon on respecte serveur (peut refléter nettoyages)
      if (localInitRef.current) {
        const serverSet = new Set(payload.items.filter(n => Number.isFinite(n)));
        const merged = Array.from(new Set([...watchedItems, ...serverSet]));
        setWatchedItems(merged);
        localInitRef.current = false;
      } else {
        setWatchedItems(payload.items.filter(n => Number.isFinite(n)));
      }
    } else if (payload.type === 'watchAck' && Number.isFinite(payload.itemId)) {
      setWatchedItems(prev => prev.includes(payload.itemId) ? prev : [...prev, payload.itemId]);
    } else if (payload.type === 'unwatchAck' && Number.isFinite(payload.itemId)) {
      if (!payload.missing) setWatchedItems(prev => prev.filter(id => id !== payload.itemId));
    }
  }, [wsBazaarMessages, watchedItems, setWatchedItems]);

  return {
    watchedItems,
    setWatchedItems,
    priceThresholds,
    setPriceThresholds,
    bazaarRows,
    blinkingItems
  };
}
