import { openDB } from 'idb';
import { pushOrReplaceToast } from './toastBus.js';

// Gardes globales anti-boucle pour ingestion logs (évite relances infinies)
let __logsIngestActive = false;
let __lastLogsIngestEnd = 0;
let __lastLogsIngestHadData = false;

// Nouveau flux: écoute des messages WebSocket getAllTornLogs
// handleStoreLogs(setStoreProgress, { ws, send, requestId }) déclenche une requête JSON et ingère les lots reçus
export function handleStoreLogs(setStoreProgress, { ws, send, requestId: externalRequestId } = {}) {
  return (async () => {
    const now = Date.now();
    if (__logsIngestActive) { try { console.debug('[handleStoreLogs] abort: already active'); } catch {} return; }
    if (!__lastLogsIngestHadData && (now - __lastLogsIngestEnd) < 5000) { try { console.debug('[handleStoreLogs] abort: cooldown after empty ingest'); } catch {} return; }
    if (!ws || ws.readyState !== 1) {
      console.warn('[handleStoreLogs] WebSocket indisponible');
      setStoreProgress({ current: 0, total: 0, percent: 0, running: false });
      return;
    }
    __logsIngestActive = true;

    const dbName = 'LogsDB';
    const storeName = 'logs';
    setStoreProgress({ current: 0, total: 0, percent: 0, running: true });

    // Trouver timestamp max
    let from = 0;
    const baseDb = await openDB(dbName, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: '_id' });
            store.createIndex('log', 'log');
            store.createIndex('timestamp', 'timestamp');
        }
      }
    });
    try {
      const tx0 = baseDb.transaction(storeName, 'readonly');
      const idx = tx0.store.index('timestamp');
      const cur = await idx.openCursor(null, 'prev');
      if (cur) from = cur.value.timestamp + 1;
      await tx0.done;
    } catch {}

    const requestId = externalRequestId || Math.random().toString(36).slice(2);
    const payload = { type: 'getAllTornLogs', from, requestId };
    try { (send || (m => ws.send(m)))(JSON.stringify(payload)); } catch(e) { console.error(e); setStoreProgress({ current:0,total:0,percent:0,running:false }); __logsIngestActive=false; return; }

    let expectedTotal = 0;
    let current = 0;
    let finished = false;
    let lastProgressTs = Date.now();

    const toastKey = 'store-logs-progress';
    function pushProgressToast({ percent, done }) {
      try {
        if (done) {
          // Toast final avec TTL court pour auto-fermeture
          pushOrReplaceToast({
            key: toastKey,
            replace: true,
            ttl: 4500,
            kind: 'success',
            title: 'Stockage Logs',
            body: `Terminé 100% – ${current} logs stockés`
          });
        } else {
          const pct = typeof percent === 'number' ? percent.toFixed(1) : '0.0';
            pushOrReplaceToast({
              key: toastKey,
              replace: true,
              ttl: 60000, // renouvelé à chaque batch; remplacé par final court
              kind: 'info',
              title: 'Stockage Logs',
              body: `${pct}% (${current}/${expectedTotal || '?'})`
            });
        }
      } catch {}
    }

    // Pré-toast initial (avant réponse start au cas où lenteur serveur)
    pushProgressToast({ percent: 0, done: false });

    function finalize() {
      if (!finished) { finished = true; }
      setStoreProgress(prev => {
        if (expectedTotal) {
          const done = expectedTotal && current >= expectedTotal ? expectedTotal : current;
          const pct = expectedTotal ? Math.min(100, Math.round(done / expectedTotal * 100)) : 100;
          return { current: done, total: expectedTotal, percent: pct >= 100 ? 100 : pct, running: false };
        }
        return { current: 0, total: 0, percent: 100, running: false };
      });
      __logsIngestActive = false;
      __lastLogsIngestEnd = Date.now();
      __lastLogsIngestHadData = current > 0;
      // Toast final (si pas déjà poussé par guard / end)
      pushProgressToast({ percent: 100, done: true });
    }

    const scheduleClear = () => {};

    const onMessage = async (ev) => {
      if (finished) return;
      let data = ev.data;
      if (typeof data !== 'string') { try { data = new TextDecoder().decode(data); } catch { return; } }
      if (!data.startsWith('{')) return;
      let parsed; try { parsed = JSON.parse(data); } catch { return; }
      if (!parsed || parsed.type !== 'getAllTornLogs' || parsed.requestId !== requestId) return;
      try { console.debug('[logsWS]', parsed.phase, parsed.sent, '/', parsed.total); } catch {}
      if (parsed.phase === 'start') {
        expectedTotal = parsed.total || 0;
        if (expectedTotal === 0) {
          finalize();
          setStoreProgress({ current:0,total:0,percent:0,running:false });
          cleanup(); scheduleClear();
        } else {
          setStoreProgress({ current:0,total:expectedTotal,percent:0,running:true });
          pushProgressToast({ percent: 0, done: false });
        }
        return;
      }
      if (parsed.phase === 'batch' && Array.isArray(parsed.batch) && parsed.batch.length) {
        try {
          const tx = (await openDB(dbName, 2)).transaction(storeName, 'readwrite');
          const st = tx.store;
          for (const obj of parsed.batch) { try { await st.put(obj); } catch {} }
          await tx.done;
        } catch(e) { console.error('[handleStoreLogs] write batch', e); }
        current += parsed.batch.length;
        lastProgressTs = Date.now();
        setStoreProgress(prev => {
          const pct = expectedTotal ? Math.min(100, Math.round(current / expectedTotal * 100)) : 0;
          const complete = expectedTotal && current >= expectedTotal;
          return { current, total: expectedTotal, percent: pct, running: !complete };
        });
        if (expectedTotal) {
          const pctNum = expectedTotal ? (current / expectedTotal * 100) : 0;
          pushProgressToast({ percent: pctNum, done: false });
        }
        return;
      }
      if (parsed.phase === 'end') { finalize(); cleanup(); return; }
      if (parsed.ok === false && parsed.error) {
        finalize();
        console.error('[handleStoreLogs] Erreur websocket:', parsed.error);
        setStoreProgress({ current:0,total:0,percent:0,running:false });
        cleanup(); scheduleClear(); return;
      }
    };

    function cleanup() { try { ws.removeEventListener('message', onMessage); } catch {} }
    ws.addEventListener('message', onMessage);

    const guard = setInterval(() => {
      if (finished) { clearInterval(guard); return; }
  if (expectedTotal > 0 && current >= expectedTotal) {
        console.warn('[handleStoreLogs] guard finalize (missing end)');
        finalize();
        setStoreProgress(prev => ({ current, total: expectedTotal, percent: 100, running:false }));
        cleanup(); scheduleClear();
      } else if (Date.now() - lastProgressTs > 30000 && expectedTotal === 0) {
        console.warn('[handleStoreLogs] guard timeout without start');
        finalize();
        setStoreProgress({ current:0,total:0,percent:0,running:false });
        cleanup(); scheduleClear();
      }
    }, 1500);

    setTimeout(() => { if (!finished) { console.warn('[handleStoreLogs] timeout'); finalize(); cleanup(); setStoreProgress({ current:0,total:0,percent:0,running:false }); } }, 120000);
  })();
}
