import { openDB } from 'idb';

const LOGS_DB_NAME = 'LogsDB';
const LOGS_STORE_NAME = 'logs';
const LOGS_DB_VERSION = 2;
const dbPromises = new Map();
const logsQueryCache = new Map();
let logsCacheTTL = 5000;

function getDB(dbName = LOGS_DB_NAME, version = LOGS_DB_VERSION, upgradeCallback) {
  const key = `${dbName}:${version}`;
  if (!dbPromises.has(key)) dbPromises.set(key, openDB(dbName, version, upgradeCallback));
  return dbPromises.get(key);
}

function upgradeLogsDb(db, _oldVersion, _newVersion, transaction) {
  let store;
  if (!db.objectStoreNames.contains(LOGS_STORE_NAME)) store = db.createObjectStore(LOGS_STORE_NAME, { keyPath: '_id' });
  else store = transaction.objectStore(LOGS_STORE_NAME);
  if (!store.indexNames.contains('log')) store.createIndex('log', 'log');
  if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp');
}

function cacheKeyForLogId(logId) {
  return `logId:${String(logId)}`;
}

function cacheRead(key) {
  const cached = logsQueryCache.get(key);
  if (cached && Date.now() - cached.ts < logsCacheTTL) return cached.data;
  if (cached) logsQueryCache.delete(key);
  return null;
}

async function getAllLogsFromStore(db) {
  if (!db.objectStoreNames.contains(LOGS_STORE_NAME)) return [];
  return db.getAll(LOGS_STORE_NAME);
}

export function setLogsCacheTTL(ms) {
  logsCacheTTL = Math.max(0, Number(ms) || 0);
}

export function getLogsCacheTTL() { return logsCacheTTL; }

export async function getLogsByLogId(logId) {
  if (logId === undefined || logId === null) return [];
  const key = cacheKeyForLogId(logId);
  const cached = cacheRead(key);
  if (cached !== null) return cached;
  try {
    const db = await getDB(LOGS_DB_NAME, LOGS_DB_VERSION, upgradeLogsDb);
    if (!db.objectStoreNames.contains(LOGS_STORE_NAME)) return [];
    const tx = db.transaction(LOGS_STORE_NAME, 'readonly');
    let data;
    try {
      data = await tx.store.index('log').getAll(logId);
    } catch (_) {
      data = (await tx.store.getAll()).filter(item => item && item.log === logId);
    }
    await tx.done;
    logsQueryCache.set(key, { ts: Date.now(), data });
    return data;
  } catch (error) {
    logsQueryCache.delete(key);
    throw error;
  }
}

export async function getLogsByTimestampRange(fromTs, toTs) {
  try {
    const db = await getDB(LOGS_DB_NAME, LOGS_DB_VERSION, upgradeLogsDb);
    if (!db.objectStoreNames.contains(LOGS_STORE_NAME)) return [];
    const tx = db.transaction(LOGS_STORE_NAME, 'readonly');
    const from = fromTs == null ? -Infinity : Number(fromTs);
    const to = toTs == null ? Infinity : Number(toTs);
    let data;
    try {
      const keyRange = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.bound(from, to) : null;
      data = keyRange ? await tx.store.index('timestamp').getAll(keyRange) : await tx.store.getAll();
      if (!keyRange) data = data.filter(item => item && item.timestamp >= from && item.timestamp <= to);
    } catch (_) {
      data = (await tx.store.getAll()).filter(item => item && item.timestamp >= from && item.timestamp <= to);
    }
    await tx.done;
    return data.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  } catch (error) {
    throw error;
  }
}

export async function getLogsRange(logId, fromTs, toTs) {
  const data = logId === undefined || logId === null
    ? await getLogsByTimestampRange(fromTs, toTs)
    : await getLogsByLogId(logId);
  if (logId !== undefined && logId !== null && fromTs == null && toTs == null) return data;
  return data.filter(entry => {
    if (!entry || typeof entry.timestamp !== 'number') return false;
    if (fromTs != null && entry.timestamp < fromTs) return false;
    if (toTs != null && entry.timestamp > toTs) return false;
    return true;
  });
}

export async function getLogsByMultipleIds(logIds) {
  if (!Array.isArray(logIds)) return new Map();
  const uniqueIds = [...new Set(logIds)];
  const results = await Promise.all(uniqueIds.map(id => getLogsByLogId(id)));
  return new Map(uniqueIds.map((id, index) => [id, results[index]]));
}

export function invalidateLogsCache(logId) {
  if (logId === undefined || logId === null) logsQueryCache.clear();
  else logsQueryCache.delete(cacheKeyForLogId(logId));
}

export function invalidateAllCaches() { logsQueryCache.clear(); }

export function resetLogsDbCacheForTests() {
  logsQueryCache.clear();
  dbPromises.clear();
}

export { getAllLogsFromStore };
