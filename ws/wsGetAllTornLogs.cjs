'use strict';

const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  DEFAULT_LOG_START,
  SAFE_ERRORS,
  getAuthenticatedSession,
  parseRange,
  parseInteger,
  sendJson,
  socketUsable,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const MIN_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 2000;
const COOLDOWN_MS = 15000;

function normalizeBatchSize(value) {
  const parsed = parseInteger(value);
  if (parsed === null) return 500;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, parsed));
}

function projectLog(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const projected = {
    _id: doc._id == null ? undefined : String(doc._id),
    log: doc.log,
    title: doc.title,
    timestamp: doc.timestamp,
    category: doc.category,
    data: doc.data,
    items_names: doc.items_names,
  };
  for (const key of Object.keys(projected)) {
    if (projected[key] === undefined) delete projected[key];
  }
  return projected;
}

module.exports = async function wsGetAllTornLogs(socket, req, fastify, parsed = {}) {
  parsed = parsed && typeof parsed === 'object' ? parsed : {};
  const session = getAuthenticatedSession(req, { requireApiKey: true });
  const requestId = parsed.requestId == null ? null : String(parsed.requestId);
  if (!session.ok) {
    sendJson(socket, { type: 'getAllTornLogs', ok: false, error: SAFE_ERRORS.LOG_RETRIEVAL_FAILED, requestId });
    return;
  }

  if (socket.__gettingAllLogs) {
    sendJson(socket, { type: 'getAllTornLogs', ok: false, error: 'already_running', phase: 'ignored', requestId });
    return;
  }
  if (socket.__lastGetAllLogsEndTime && Date.now() - socket.__lastGetAllLogsEndTime < COOLDOWN_MS) {
    sendJson(socket, {
      type: 'getAllTornLogs',
      ok: false,
      error: 'cooldown',
      remaining: COOLDOWN_MS - (Date.now() - socket.__lastGetAllLogsEndTime),
      phase: 'ignored',
      requestId,
    });
    return;
  }

  socket.__gettingAllLogs = true;
  let cursor;
  let successful = false;
  try {
    const range = parseRange(parsed, {
      defaultFrom: DEFAULT_LOG_START,
      defaultTo: Math.floor(Date.now() / 1000),
    });
    if (!range.ok) {
      sendJson(socket, { type: 'getAllTornLogs', ok: false, error: SAFE_ERRORS.INVALID_RANGE, requestId });
      return;
    }
    const batchSize = normalizeBatchSize(parsed.batchSize);
    await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log);
    const database = getUserDb(fastify, req);
    const logsCollection = database.collection('logs');
    const filter = { timestamp: { $gte: range.from, $lte: range.to } };
    const total = await logsCollection.countDocuments(filter);
    if (!socketUsable(socket)) throw new Error('socket unusable');
    if (!sendJson(socket, { type: 'getAllTornLogs', phase: 'start', from: range.from, to: range.to, total, batchSize, requestId })) {
      throw new Error('socket unusable');
    }

    cursor = logsCollection.find(filter, {
      projection: { _id: 1, log: 1, title: 1, timestamp: 1, category: 1, data: 1, items_names: 1 },
      sort: { timestamp: 1, _id: 1 },
    });
    let sent = 0;
    let batch = [];
    while (await cursor.hasNext()) {
      if (!socketUsable(socket)) throw new Error('socket unusable');
      const document = projectLog(await cursor.next());
      if (!document) continue;
      batch.push(document);
      if (batch.length < batchSize) continue;
      sent += batch.length;
      if (!sendJson(socket, { type: 'getAllTornLogs', phase: 'batch', batch, sent, total, requestId })) throw new Error('socket unusable');
      batch = [];
    }
    if (batch.length) {
      sent += batch.length;
      if (!sendJson(socket, { type: 'getAllTornLogs', phase: 'batch', batch, sent, total, requestId })) throw new Error('socket unusable');
    }
    if (!sendJson(socket, { type: 'getAllTornLogs', phase: 'end', sent, total, requestId })) throw new Error('socket unusable');
    socket.__lastGetAllLogsEndTime = Date.now();
    successful = true;
  } catch (error) {
    logMessage(fastify, 'warn', 'Torn log retrieval failed', { userId: session.userId, requestId, error: error.message });
    sendJson(socket, { type: 'getAllTornLogs', ok: false, error: SAFE_ERRORS.LOG_RETRIEVAL_FAILED, requestId });
  } finally {
    try { if (cursor && typeof cursor.close === 'function') await cursor.close(); } catch (_) {}
    socket.__gettingAllLogs = false;
    if (!successful && socket.__lastGetAllLogsEndTime === undefined) socket.__lastGetAllLogsEndTime = 0;
  }
};

module.exports.projectLog = projectLog;
module.exports.normalizeBatchSize = normalizeBatchSize;
