// src/indexeddbUtils.js
// Fonctions utilitaires pour accéder à IndexedDB et agréger les données pour les graphiques avec la librairie idb

import { openDB } from 'idb';

/**
 * Ouvre la base IndexedDB et retourne une instance idb database.
 */
export async function openDatabase(dbName = 'LogsDB', version = 1, upgradeCallback) {
  return openDB(dbName, version, {
    upgrade(db) {
      if (upgradeCallback) upgradeCallback(db);
    },
  });
}

/**
 * Récupère tous les objets d'un index pour une valeur donnée (ex: log).
 * @param {IDBPDatabase} db
 * @param {string} storeName
 * @param {string} indexName
 * @param {number|string} value
 * @returns {Promise<Array>}
 */
export async function getAllByIndex(db, storeName, indexName, value) {
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.store.index(indexName);
  const results = await index.getAll(value);
  await tx.done;
  return results;
}

/**
 * Récupère tous les objets d'un store.
 * @param {IDBPDatabase} db
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export async function getAllFromStore(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  const results = await tx.store.getAll();
  await tx.done;
  return results;
}

/**
 * Agrège les objets par jour (UTC) selon une fonction d'extraction de valeur.
 * @param {Array} objects
 * @param {function(obj): number} getValue
 * @param {function(obj): number} [getTimestamp] (optionnel)
 * @returns {{ days: string[], sums: number[] }}
 */
export function sumByDay(objects, getValue, getTimestamp) {
  const daySums = {};
  objects.forEach(obj => {
    const ts = getTimestamp ? getTimestamp(obj) : obj.timestamp;
    const day = new Date(ts * 1000).toISOString().slice(0, 10);
    if (!daySums[day]) daySums[day] = 0;
    daySums[day] += getValue(obj);
  });
  const days = Object.keys(daySums).sort();
  const sums = days.map(day => daySums[day]);
  return { days, sums };
}

/**
 * Exemple d'utilisation dans un composant :
 *
 * import { openDatabase, getAllByIndex, sumByDay } from './indexeddbUtils';
 *
 * useEffect(() => {
 *   openDatabase('LogsDB').then(db =>
 *     getAllByIndex(db, 'logs', 'log', 5302)
 *   ).then(objects => {
 *     const { days, sums } = sumByDay(objects, obj => obj.data.speed_after || 0);
 *     // ...
 *   });
 * }, []);
 */
