import { openDB } from 'idb';
import { invalidateAllCaches } from './dbLayer.js';

let __logsIngestActive = false;
let __lastLogsIngestEnd = 0;
let __lastLogsIngestHadData = false;

function progressValue(current, total, running) {
  if (!total) return { current: 0, total: 0, percent: running ? 0 : 100, running };
  return {
    current: Math.min(current, total),
    total,
    percent: Math.min(100, Math.round(Math.min(current, total) / total * 100)),
    running,
  };
}

function decodeMessage(event) {
  let data = event && event.data;
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return null;
}

/**
 * Stream server log batches into IndexedDB. Every terminal path removes all
 * listeners/timers and clears the in-memory concurrency guard.
 */
export function handleStoreLogs(setStoreProgress, {
  ws,
  send,
  requestId: externalRequestId,
  timeoutMs = 120000,
  guardIntervalMs = 1500,
} = {}) {
  return (async () => {
    const now = Date.now();
    if (__logsIngestActive) return;
    if (!__lastLogsIngestHadData && now - __lastLogsIngestEnd < 5000) return;
    if (!ws || ws.readyState !== undefined && ws.readyState !== 1) {
      setStoreProgress({ current: 0, total: 0, percent: 0, running: false, error: 'WebSocket indisponible' });
      return;
    }

    __logsIngestActive = true;
    const dbName = 'LogsDB';
    const storeName = 'logs';
    const id = externalRequestId == null || String(externalRequestId) === ''
      ? Math.random().toString(36).slice(2)
      : String(externalRequestId);
    let db;
    let guard;
    let timeout;
    let onMessage;
    let onClose;
    let onError;
    let queue = Promise.resolve();
    let finished = false;
    let started = false;
    let current = 0;
    let total = 0;
    let lastProgressTs = Date.now();

    const cleanup = () => {
      if (guard) clearInterval(guard);
      if (timeout) clearTimeout(timeout);
      try { if (onMessage) ws.removeEventListener('message', onMessage); } catch (_) {}
      try { if (onClose) ws.removeEventListener('close', onClose); } catch (_) {}
      try { if (onError) ws.removeEventListener('error', onError); } catch (_) {}
    };

    const finish = (success, error) => {
      if (finished) return;
      finished = true;
      cleanup();
      __logsIngestActive = false;
      __lastLogsIngestEnd = Date.now();
      __lastLogsIngestHadData = current > 0;
      if (success) {
        setStoreProgress(progressValue(total ? total : current, total, false));
      } else {
        setStoreProgress({ ...progressValue(current, total, false), percent: 0, error: error || 'Log synchronization failed' });
      }
    };

    try {
      setStoreProgress({ current: 0, total: 0, percent: 0, running: true });
      db = await openDB(dbName, 2, {
        upgrade(database, _oldVersion, _newVersion, transaction) {
          let store;
          if (!database.objectStoreNames.contains(storeName)) {
            store = database.createObjectStore(storeName, { keyPath: '_id' });
          } else {
            store = transaction.objectStore(storeName);
          }
          if (!store.indexNames.contains('log')) store.createIndex('log', 'log');
          if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp');
        },
      });

      let from = 0;
      try {
        const tx = db.transaction(storeName, 'readonly');
        const index = tx.store.index('timestamp');
        const cursor = await index.openCursor(null, 'prev');
        if (cursor && Number.isFinite(cursor.value.timestamp)) from = Number(cursor.value.timestamp) + 1;
        await tx.done;
      } catch (_) {}

      const sendMessage = send || (message => ws.send(message));
      onMessage = event => {
        queue = queue.then(async () => {
          if (finished) return;
          const raw = decodeMessage(event);
          if (raw === null || !raw.trim().startsWith('{')) return;
          let parsed;
          try { parsed = JSON.parse(raw); } catch (_) {
            finish(false, 'Malformed log synchronization message');
            return;
          }
          if (!parsed || parsed.type !== 'getAllTornLogs' || String(parsed.requestId) !== id) return;
          lastProgressTs = Date.now();
          if (parsed.phase === 'start') {
            if (!Number.isSafeInteger(Number(parsed.total)) || Number(parsed.total) < 0) {
              finish(false, 'Invalid log synchronization total');
              return;
            }
            total = Number(parsed.total);
            started = true;
            if (total === 0) finish(true);
            else setStoreProgress(progressValue(0, total, true));
            return;
          }
          if (parsed.ok === false && parsed.error) {
            finish(false, 'Log synchronization failed');
            return;
          }
          if (parsed.phase === 'batch') {
            if (!started || !Array.isArray(parsed.batch) || parsed.batch.length === 0 || total === 0) {
              finish(false, 'Invalid log synchronization batch');
              return;
            }
            if (current + parsed.batch.length > total) {
              finish(false, 'Log synchronization count mismatch');
              return;
            }
            const tx = db.transaction(storeName, 'readwrite');
            for (const record of parsed.batch) {
              if (!record || record._id === undefined || record._id === null) {
                finish(false, 'Invalid log synchronization record');
                return;
              }
              await tx.store.put(record);
            }
            await tx.done;
            current += parsed.batch.length;
            invalidateAllCaches();
            setStoreProgress(progressValue(current, total, current < total));
            return;
          }
          if (parsed.phase === 'end') {
            if (!started || current !== total || Number(parsed.sent) !== total) {
              finish(false, 'Incomplete log synchronization');
              return;
            }
            finish(true);
          }
        }).catch(error => finish(false, error && error.message ? error.message : 'Log synchronization failed'));
        return queue;
      };
      onClose = () => finish(false, 'WebSocket closed during log synchronization');
      onError = () => finish(false, 'WebSocket error during log synchronization');
      ws.addEventListener('message', onMessage);
      if (typeof ws.addEventListener === 'function') {
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onError);
      }

      setStoreProgress({ current: 0, total: 0, percent: 0, running: true });
      await Promise.resolve(sendMessage(JSON.stringify({ type: 'getAllTornLogs', from, requestId: id })));
      if (finished) return;

      guard = setInterval(() => {
        if (finished) return;
        if (total > 0 && current >= total) {
          finish(true);
        } else if (Date.now() - lastProgressTs > Math.min(timeoutMs, 30000)) {
          finish(false, 'Log synchronization timed out');
        }
      }, guardIntervalMs);
      timeout = setTimeout(() => finish(false, 'Log synchronization timed out'), timeoutMs);
    } catch (error) {
      finish(false, error && error.message ? error.message : 'Log synchronization failed');
    }
  })();
}

export function resetLogsIngestStateForTests() {
  __logsIngestActive = false;
  __lastLogsIngestEnd = 0;
  __lastLogsIngestHadData = false;
}
