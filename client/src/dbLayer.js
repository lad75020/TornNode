// Central IndexedDB access layer with short-lived in-memory cache to reduce repeated transactions
import { openDB } from 'idb';

// Promise cache for DB instances (one open per dbName)
const dbPromises = new Map();

function getDB(dbName, version, upgradeCallback) {
  const key = dbName + ':' + (version || '');
  if (!dbPromises.has(key)) {
    dbPromises.set(key, openDB(dbName, version, upgradeCallback));
  }
  return dbPromises.get(key);
}

// LogsDB specific helpers
const LOGS_DB_NAME = 'LogsDB';
// query cache: key -> { ts, data }
const logsQueryCache = new Map();
let logsCacheTTL = 5000; // 5 seconds default

export function setLogsCacheTTL(ms) { logsCacheTTL = ms; }
export function getLogsCacheTTL() { return logsCacheTTL; }

export async function getLogsByLogId(logId) {
  const cacheKey = 'logId:' + logId;
  const now = Date.now();
  const cached = logsQueryCache.get(cacheKey);
  if (cached && (now - cached.ts) < logsCacheTTL) {
    return cached.data;
  }
  const db = await getDB(LOGS_DB_NAME);
  if (!db.objectStoreNames.contains('logs')) return [];
  const tx = db.transaction('logs');
  const index = tx.store.index('log');
  const data = await index.getAll(logId);
  logsQueryCache.set(cacheKey, { ts: now, data });
  return data;
}

// Range query with partial cache reuse: if a full logId set is cached, filter in-memory;
// else read all (IndexedDB lacks compound range index here) then filter.
export async function getLogsRange(logId, fromTs, toTs) {
  const all = await getLogsByLogId(logId);
  if (fromTs == null && toTs == null) return all;
  return all.filter(e => {
    if (!e || typeof e.timestamp !== 'number') return false;
    if (fromTs != null && e.timestamp < fromTs) return false;
    if (toTs != null && e.timestamp > toTs) return false;
    return true;
  });
}

export async function getLogsByMultipleIds(logIds) {
  const results = await Promise.all(logIds.map(id => getLogsByLogId(id)));
  const map = new Map();
  logIds.forEach((id, i) => map.set(id, results[i]));
  return map; // Map<logId, entries[]>
}

export function invalidateLogsCache(logId) {
  if (typeof logId === 'number') logsQueryCache.delete('logId:' + logId);
  else if (logId == null) logsQueryCache.clear();
}

// Generic invalidate (used when new logs imported)
export function invalidateAllCaches() { logsQueryCache.clear(); }
