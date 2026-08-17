import { useCallback, useEffect, useRef, useState } from 'react';
import usePersistentState from './usePersistentState.js';
import {
  evaluateThreshold,
  normalizeItemId,
  normalizePriceUpdate,
  sanitizeThresholds,
  sanitizeWatchedItems,
} from '../../../utils/bazaarMarket.cjs';

function notifyPriceDrop(itemId, name, price, threshold) {
  if (typeof window === 'undefined') return false;
  const safePrice = Number(price);
  const safeThreshold = Number(threshold);
  const body = `${name || itemId} à ${safePrice.toLocaleString()} (≤ ${safeThreshold.toLocaleString()})`;
  let delivered = false;
  if ('Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification('Bazaar: prix en baisse', { body, tag: `bazaar-price-${itemId}` });
        delivered = true;
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            try {
              new Notification('Bazaar: prix en baisse', {
                body,
                tag: `bazaar-price-${itemId}`,
              });
            } catch (_) {}
          }
        }).catch(() => {});
      }
    } catch (_) {}
  }
  return delivered;
}

function parseMessage(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

export default function useBazaarAlerts(wsBazaarMessages = []) {
  const [storedWatchedItems, setStoredWatchedItems] = usePersistentState('watchedItems', []);
  const [storedPriceThresholds, setStoredPriceThresholds] = usePersistentState('priceThresholds', {});
  const [bazaarRows, setBazaarRows] = useState([]);
  const [blinkingItems, setBlinkingItems] = useState(() => new Set());

  const watchedItems = sanitizeWatchedItems(storedWatchedItems);
  const priceThresholds = sanitizeThresholds(storedPriceThresholds);
  const watchedItemsRef = useRef(watchedItems);
  const thresholdsRef = useRef(priceThresholds);
  const triggeredRef = useRef(new Set());
  const latestTimeRef = useRef(new Map());
  const lastMessageRef = useRef(null);
  const blinkTimersRef = useRef(new Map());

  const setWatchedItems = useCallback((next) => {
    setStoredWatchedItems(previous => {
      const current = sanitizeWatchedItems(previous);
      const candidate = typeof next === 'function' ? next(current) : next;
      return sanitizeWatchedItems(candidate);
    });
  }, [setStoredWatchedItems]);

  const setPriceThresholds = useCallback((next) => {
    setStoredPriceThresholds(previous => {
      const current = sanitizeThresholds(previous);
      const candidate = typeof next === 'function' ? next(current) : next;
      return sanitizeThresholds(candidate);
    });
  }, [setStoredPriceThresholds]);

  useEffect(() => {
    watchedItemsRef.current = watchedItems;
    const watchedSet = new Set(watchedItems);
    setBazaarRows(previous => previous.filter(row => watchedSet.has(row.itemId)));
    for (const itemId of Array.from(triggeredRef.current)) {
      if (!watchedSet.has(itemId)) triggeredRef.current.delete(itemId);
    }
  }, [watchedItems]);

  useEffect(() => {
    thresholdsRef.current = priceThresholds;
  }, [priceThresholds]);

  useEffect(() => () => {
    for (const timer of blinkTimersRef.current.values()) clearTimeout(timer);
    blinkTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!Array.isArray(wsBazaarMessages) || wsBazaarMessages.length === 0) return;
    const raw = wsBazaarMessages[wsBazaarMessages.length - 1];
    if (raw === lastMessageRef.current) return;
    lastMessageRef.current = raw;

    const payload = parseMessage(raw);
    if (!payload) return;

    if (payload.type === 'watchList' && Array.isArray(payload.items)) {
      // The server list is scoped to this socket. Merge it without allowing a
      // reconnect's empty initial list to erase locally persisted watches.
      setWatchedItems(previous => [...previous, ...payload.items]);
      return;
    }

    const acknowledgedId = normalizeItemId(payload.itemId);
    if (payload.type === 'watchAck' && acknowledgedId !== null) {
      setWatchedItems(previous => [...previous, acknowledgedId]);
      return;
    }
    if (payload.type === 'unwatchAck' && acknowledgedId !== null && !payload.missing) {
      setWatchedItems(previous => previous.filter(itemId => itemId !== acknowledgedId));
      return;
    }

    const update = normalizePriceUpdate(payload);
    if (!update || !watchedItemsRef.current.includes(update.itemId)) return;

    const previousTime = latestTimeRef.current.get(update.itemId);
    if (previousTime !== undefined && update.time <= previousTime) return;
    latestTimeRef.current.set(update.itemId, update.time);

    if (update.listings.length > 0) {
      const minimum = update.listings[0];
      const row = {
        time: update.time,
        itemId: update.itemId,
        itemName: update.itemName,
        price: minimum.price,
        quantity: minimum.quantity,
        ...(minimum.seller ? { seller: minimum.seller } : {}),
      };
      setBazaarRows(previous => [row, ...previous.filter(item => item.itemId !== row.itemId)]);

      const threshold = thresholdsRef.current[update.itemId];
      const decision = evaluateThreshold({
        minimum: update.minBazaar,
        threshold,
        triggered: triggeredRef.current.has(update.itemId),
      });
      if (decision.recovered) triggeredRef.current.delete(update.itemId);
      if (decision.trigger) {
        triggeredRef.current.add(update.itemId);
        setBlinkingItems(previous => {
          const next = new Set(previous);
          next.add(update.itemId);
          return next;
        });
        const existingTimer = blinkTimersRef.current.get(update.itemId);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          blinkTimersRef.current.delete(update.itemId);
          setBlinkingItems(previous => {
            const next = new Set(previous);
            next.delete(update.itemId);
            return next;
          });
        }, 5000);
        blinkTimersRef.current.set(update.itemId, timer);
        notifyPriceDrop(update.itemId, update.itemName, update.minBazaar, threshold);
      }
    }
    // Empty or invalid listings intentionally preserve the previous row and
    // alert episode. Only a valid minimum strictly above the threshold resets.
  }, [setWatchedItems, wsBazaarMessages]);

  return {
    watchedItems,
    setWatchedItems,
    priceThresholds,
    setPriceThresholds,
    bazaarRows,
    blinkingItems,
  };
}
