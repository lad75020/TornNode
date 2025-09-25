// Gestion IndexedDB locale des items (écriture / lecture) – plus d'appel HTTP direct ici
import { openDB } from 'idb';

const DB_NAME = 'ItemsDB';
const STORE_NAME = 'items';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    }
  });
}

// Écrit (remplace) la liste des items dans l'IDB
export async function writeItemsToIndexedDB(items) {
  if (!Array.isArray(items) || !items.length) return { count: 0 };
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.store;
    await store.clear();
    for (const it of items) {
      if (it && typeof it.id !== 'undefined') await store.put(it);
    }
    await tx.done;
    try { localStorage.setItem('itemsLastSync', Date.now().toString()); } catch(_) {}
    return { count: items.length };
  } catch(e) {
    console.warn('[writeItemsToIndexedDB] Erreur:', e.message);
    return { error: e.message };
  }
}

// Lecture de tous les items
export async function getAllItemsFromIDB() {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(STORE_NAME)) return [];
    return await db.getAll(STORE_NAME);
  } catch(e) {
    return [];
  }
}

// Ancienne fonction syncItemsToIndexedDB supprimée (remplacée par requête WS + writeItemsToIndexedDB)
