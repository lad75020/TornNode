// wsGetAllTornLogs.js
// Envoie les logs via WebSocket en JSON par lots
module.exports = async function wsGetAllTornLogs(socket, req, fastify, parsed) {
  try {
    if (!req.session || !req.session.TornAPIKey) {
      try { socket.send(JSON.stringify({ type: 'getAllTornLogs', ok: false, error: 'Invalid session' })); } catch(_) {}
      return;
    }
    // Anti-réentrance: empêcher plusieurs scans simultanés
    if (socket.__gettingAllLogs) {
      try { socket.send(JSON.stringify({ type:'getAllTornLogs', ok:false, error:'already_running', phase:'ignored', requestId: parsed && parsed.requestId })); } catch(_){ }
      return;
    }
    // Cooldown (empêche boucles d'appel immédiates après un end)
    const COOLDOWN_MS = 15000;
    if (socket.__lastGetAllLogsEndTime && Date.now() - socket.__lastGetAllLogsEndTime < COOLDOWN_MS) {
      try { socket.send(JSON.stringify({ type:'getAllTornLogs', ok:false, error:'cooldown', remaining: COOLDOWN_MS - (Date.now() - socket.__lastGetAllLogsEndTime), phase:'ignored', requestId: parsed && parsed.requestId })); } catch(_){ }
      return;
    }
    socket.__gettingAllLogs = true;
    let { from, to, batchSize, requestId } = parsed || {};
    if (!to) to = Math.floor(Date.now()/1000);
    if (!from) from = 1716574650; // fallback historique
    batchSize = Math.min(Math.max(parseInt(batchSize)||500, 50), 2000); // bornes

  // Utiliser la base spécifique utilisateur (cohérent avec wsTorn)
  const getUserDb = require('../utils/getUserDb.cjs');
  const database = getUserDb(fastify, req);
  const logsCollection = database.collection('logs');
    const options = {
      projection: {
        _id: { $toString: '$_id' },
        log: 1,
        title: 1,
        timestamp: 1,
        category: 1,
        data: 1
      },
      sort: { timestamp: 1 }
    };

    // Cursor sur la plage
    const cursor = logsCollection.find({ timestamp: { $gte: parseInt(from), $lte: parseInt(to) } }, options);
    let sent = 0;
    const buffer = [];
    const total = await logsCollection.countDocuments({ timestamp: { $gte: parseInt(from), $lte: parseInt(to) } });
    try { socket.send(JSON.stringify({ type: 'getAllTornLogs', phase: 'start', from, to, total, batchSize, requestId })); } catch(_) {}

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      buffer.push(doc);
      if (buffer.length >= batchSize) {
        sent += buffer.length;
        try { socket.send(JSON.stringify({ type: 'getAllTornLogs', phase: 'batch', batch: buffer, sent, total, requestId })); } catch(_) { /* ignore */ }
        buffer.length = 0;
      }
    }
    if (buffer.length) {
      sent += buffer.length;
      try { socket.send(JSON.stringify({ type: 'getAllTornLogs', phase: 'batch', batch: buffer, sent, total, requestId })); } catch(_) {}
    }
  try { socket.send(JSON.stringify({ type: 'getAllTornLogs', phase: 'end', sent, total, requestId })); } catch(_) {}
  socket.__lastGetAllLogsEndTime = Date.now();
  socket.__gettingAllLogs = false;
  } catch (e) {
  if (fastify && fastify.log) fastify.log.error('[wsGetAllTornLogs] '+e.message);
    try { socket.send(JSON.stringify({ type: 'getAllTornLogs', ok:false, error: e.message, requestId: parsed && parsed.requestId })); } catch(_) {}
  socket.__gettingAllLogs = false;
  }
};
