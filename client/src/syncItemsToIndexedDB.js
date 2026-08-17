// Local IndexedDB catalog storage. A failed refresh never deletes the last
// known-good catalog and the freshness marker is written only after commit.
import { openDB } from 'idb';

const DB_NAME = 'ItemsDB';
const STORE_NAME = 'items';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    },
  });
}

function validItem(item) {
  return item && (typeof item.id === 'number' || typeof item.id === 'string') && String(item.id).trim() !== '';
}

/**
 * Atomically replace the local catalog. Empty or malformed responses preserve
 * existing data unless the caller explicitly requests a clear operation.
 */
export async function writeItemsToIndexedDB(items, { clear = false } = {}) {
  if (!Array.isArray(items)) return { count: 0, preserved: true, error: 'Invalid item catalog' };
  if (items.some(item => !validItem(item))) {
    return { count: 0, preserved: true, error: 'Invalid item catalog' };
  }
  const validItems = items.filter(validItem);
  if (validItems.length === 0 && !clear) return { count: 0, preserved: true };
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    if (clear || validItems.length > 0) await tx.store.clear();
    for (const item of validItems) await tx.store.put(item);
    await tx.done;
    try { localStorage.setItem('itemsLastSync', Date.now().toString()); } catch (_) {}
    return { count: validItems.length, preserved: false };
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
    const value = Number(localStorage.getItem('itemsLastSync'));
    return Number.isFinite(value) ? value : 0;
  } catch (_) {
    return 0;
  }
}
