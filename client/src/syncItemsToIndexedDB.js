// Local IndexedDB catalog storage. A failed refresh never deletes the last
// known-good catalog and the freshness marker is written only after commit.
import { openDB } from 'idb';

const DB_NAME = 'ItemsDB';
const STORE_NAME = 'items';
const DB_VERSION = 1;
export const ITEMS_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    },
  });
}

export function normalizeItemId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function isCompleteItem(item) {
  return Boolean(
    item
      && normalizeItemId(item.id) !== null
      && typeof item.name === 'string'
      && Number.isFinite(item.price)
      && item.price >= 0
      && typeof item.img64 === 'string'
      && typeof item.description === 'string',
  );
}

async function restoreItems(db, items) {
  const rollback = db.transaction(STORE_NAME, 'readwrite');
  await rollback.store.clear();
  for (const item of items) await rollback.store.put(item);
  await rollback.done;
}

/**
 * Atomically replace the local catalog. Empty, malformed, or unavailable
 * responses preserve existing data and never advance the freshness marker.
 */
export async function writeItemsToIndexedDB(items, { clear: _clear = false } = {}) {
  if (!Array.isArray(items)) return { count: 0, preserved: true, error: 'Invalid item catalog' };
  if (items.length === 0 || items.some(item => !isCompleteItem(item))) {
    return { count: 0, preserved: true, error: items.length === 0 ? undefined : 'Invalid item catalog' };
  }
  try {
    const db = await getDB();
    const previousItems = await db.getAll(STORE_NAME);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.clear();
    for (const item of items) await tx.store.put(item);
    await tx.done;
    try {
      localStorage.setItem('itemsLastSync', Date.now().toString());
    } catch (error) {
      try {
        await restoreItems(db, previousItems);
        return { count: previousItems.length, preserved: true, error: 'Freshness marker unavailable' };
      } catch (rollbackError) {
        console.warn('[writeItemsToIndexedDB] marker rollback failed:', rollbackError && rollbackError.message);
        return { count: items.length, preserved: false, error: 'Freshness marker unavailable' };
      }
    }
    return { count: items.length, preserved: false };
  } catch (error) {
    console.warn('[writeItemsToIndexedDB] item catalog transaction failed:', error && error.message);
    return { count: 0, preserved: true, error: error && error.message ? error.message : 'IndexedDB unavailable' };
  }
}

export async function getAllItemsFromIDB() {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_NAME)) return [];
    return await db.getAll(STORE_NAME);
  } catch (_) {
    return [];
  }
}

export function getItemsLastSync() {
  try {
    const raw = localStorage.getItem('itemsLastSync');
    if (!raw || !/^\d+$/.test(raw)) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch (_) {
    return 0;
  }
}

export function isItemsCatalogStale(now = Date.now()) {
  const lastSync = getItemsLastSync();
  return !Number.isFinite(now) || lastSync <= 0 || now - lastSync > ITEMS_SYNC_MAX_AGE_MS;
}
