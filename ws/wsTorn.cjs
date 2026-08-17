'use strict';

const { TornAPI } = require('torn-client');
const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  DEFAULT_LOG_START,
  SAFE_ERRORS,
  getAuthenticatedSession,
  parseRange,
  sendJson,
  socketUsable,
  isDuplicateError,
  sleep,
  withRetries,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const WINDOW_SECONDS = 900;
const DEFAULT_SEGMENT_DELAY_MS = 1500;

function createClient(apiKey, options = {}) {
  if (options.tornClient) return options.tornClient;
  const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
    ? process.env.TORN_API_URL.replace(/\/+$/, '')
    : undefined;
  return new TornAPI({ apiKeys: [apiKey], ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}) });
}

function normalizeLog(raw, sourceId) {
  if (!raw || typeof raw !== 'object') return null;
  const timestamp = Number(raw.timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) return null;
  const stableId = raw.id ?? raw._id ?? sourceId;
  if (stableId === undefined || stableId === null || String(stableId).trim() === '') return null;

  const value = { ...raw, _id: String(stableId), timestamp, date: new Date(timestamp * 1000) };
  delete value.id;
  if (value.details && typeof value.details === 'object') {
    value.log = value.details.id ?? value.log;
    value.title = value.details.title ?? value.title;
    value.category = value.details.category ?? value.category;
    delete value.details;
  }
  return value;
}

async function enrichItemNames(value, fastify) {
  if (!value || (value.log !== 9020 && !(value.data && value.data.log === 9020))) return;
  const itemsGained = value.data && value.data.items_gained;
  if (!itemsGained || typeof itemsGained !== 'object') return;
  const ids = Array.isArray(itemsGained)
    ? itemsGained.map(item => Number(item && (item.id ?? item.item_id))).filter(Number.isSafeInteger)
    : Object.keys(itemsGained).map(id => Number(id)).filter(Number.isSafeInteger);
  const redis = fastify && fastify.redis;
  if (!redis || ids.length === 0) return;

  const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey.cjs');
  const names = [];
  for (const id of ids) {
    try {
      const raw = await redis.sendCommand(['JSON.GET', `${ITEMS_KEY_PREFIX}${id}`, '$.name']);
      if (typeof raw !== 'string' || raw.length === 0) continue;
      const parsed = JSON.parse(raw);
      const name = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof name === 'string' && name.trim()) names.push(name);
    } catch (_) {}
  }
  const unique = [...new Set(names)];
  value.data = { ...(value.data || {}), items_names: unique };
}

async function insertLog(collection, value) {
  try {
    await collection.insertOne(value);
    return true;
  } catch (error) {
    if (isDuplicateError(error)) return false;
    throw error;
  }
}

module.exports = async function wsTorn(socket, req, fastify, options = {}) {
  const managedByRouter = options.managedByRouter === true;
  const session = getAuthenticatedSession(req, { requireApiKey: true });
  const requestId = options.requestId == null ? null : String(options.requestId);

  if (!session.ok) {
    // The router sets this guard before invoking the async handler. If the
    // session expires between those two operations, release the guard here so
    // the connection is not permanently wedged.
    if (managedByRouter) {
      socket.__importingLogs = false;
      if (socket.__stopImport) delete socket.__stopImport.logs;
    }
    sendJson(socket, options.dryRun
      ? { type: 'wsTornTestResult', ok: false, requestId, error: SAFE_ERRORS.INVALID_SESSION }
      : { type: 'importProgress', kind: 'logs', error: SAFE_ERRORS.INVALID_SESSION });
    return;
  }

  if (options.dryRun) {
    const range = parseRange(options, { defaultFrom: undefined, defaultTo: undefined });
    if (!range.ok || options.from === undefined || options.to === undefined) {
      sendJson(socket, { type: 'wsTornTestResult', ok: false, requestId, error: SAFE_ERRORS.INVALID_RANGE });
      return;
    }
    try {
      const client = createClient(session.apiKey, options);
      const response = await client.user.log({ from: range.from, to: range.to });
      let serializable = response;
      try { serializable = JSON.parse(JSON.stringify(response)); } catch (_) {}
      sendJson(socket, { type: 'wsTornTestResult', ok: true, requestId, from: range.from, to: range.to, response: serializable });
    } catch (error) {
      logMessage(fastify, 'warn', 'Torn log dry-run failed', { requestId, error: error.message });
      sendJson(socket, { type: 'wsTornTestResult', ok: false, requestId, error: SAFE_ERRORS.IMPORT_FAILED });
    }
    return;
  }

  if (socket.__importingLogs && !managedByRouter) {
    sendJson(socket, { type: 'importProgress', kind: 'logs', error: 'already_running', phase: 'rejected' });
    return;
  }
  if (!managedByRouter) socket.__importingLogs = true;
  socket.__stopImport = socket.__stopImport || {};
  socket.__stopImport.logs = false;

  let completed = false;
  let stopped = false;
  try {
    const range = parseRange(options, {
      defaultFrom: options.from === undefined ? DEFAULT_LOG_START : undefined,
      defaultTo: options.to === undefined ? Math.floor(Date.now() / 1000) : undefined,
    });
    if (!range.ok) {
      sendJson(socket, { type: 'importProgress', kind: 'logs', error: SAFE_ERRORS.INVALID_RANGE });
      return;
    }

    const database = options.database || (await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log), getUserDb(fastify, req));
    const logsCollection = database.collection('logs');
    const client = createClient(session.apiKey, options);
    let startTs = range.from;
    if (options.from === undefined) {
      const lastDoc = await logsCollection.findOne({}, { sort: { timestamp: -1 }, limit: 1 });
      const latest = lastDoc && Number(lastDoc.timestamp);
      startTs = Number.isSafeInteger(latest) ? latest + 1 : DEFAULT_LOG_START;
    }
    const endTs = range.to;
    if (startTs > endTs) {
      sendJson(socket, { type: 'importedData', logsImported: 0, note: 'up-to-date' });
      completed = true;
      return;
    }

    const totalSeconds = Math.max(1, endTs - startTs + 1);
    let inserted = 0;
    let lastProgress = -1;
    const retryDelayMs = options.retryDelayMs == null ? Number(process.env.TORN_IMPORT_RETRY_DELAY_MS || 10000) : Number(options.retryDelayMs);
    const segmentDelayMs = options.segmentDelayMs == null ? DEFAULT_SEGMENT_DELAY_MS : Number(options.segmentDelayMs);

    socket.__logsProgress = 0;
    sendJson(socket, { type: 'importProgress', kind: 'logs', percent: 0, currentTs: startTs, startTs, endTs, inserted });
    for (let windowStart = startTs; windowStart <= endTs; windowStart += WINDOW_SECONDS) {
      if (socket.__stopImport.logs || !socketUsable(socket)) {
        stopped = true;
        sendJson(socket, { type: 'importStopped', kind: 'logs', startTs, endTs, inserted });
        return;
      }
      const windowEnd = Math.min(endTs, windowStart + WINDOW_SECONDS - 1);
      const response = await withRetries(
        () => client.user.log({ from: windowStart, to: windowEnd }),
        {
          maxAttempts: options.maxAttempts == null ? 3 : Number(options.maxAttempts),
          delayMs: retryDelayMs,
          shouldStop: () => socket.__stopImport.logs || !socketUsable(socket),
          onRetry: (error, attempt) => logMessage(fastify, 'warn', 'Torn log window retry', { from: windowStart, to: windowEnd, attempt, code: error && error.code }),
        },
      );
      const logBlock = response && response.log && typeof response.log === 'object' ? response.log : {};
      for (const [sourceId, raw] of Object.entries(logBlock)) {
        const value = normalizeLog(raw, sourceId);
        if (!value) continue;
        await enrichItemNames(value, fastify);
        if (await insertLog(logsCollection, value)) inserted += 1;
      }
      if (socket.__stopImport.logs || !socketUsable(socket)) {
        stopped = true;
        sendJson(socket, { type: 'importStopped', kind: 'logs', startTs, endTs, inserted });
        return;
      }

      const currentTs = windowEnd;
      const percent = Math.min(100, Math.max(0, ((currentTs - startTs + 1) / totalSeconds) * 100));
      if (percent - lastProgress >= 2 || percent >= 100) {
        lastProgress = percent;
        socket.__logsProgress = percent;
        sendJson(socket, {
          type: 'importProgress',
          kind: 'logs',
          percent: Number(percent.toFixed(1)),
          currentTs,
          startTs,
          endTs,
          inserted,
        });
      }
      if (segmentDelayMs > 0) {
        await sleep(segmentDelayMs);
      }
    }

    if (lastProgress < 100) {
      sendJson(socket, { type: 'importProgress', kind: 'logs', percent: 100, currentTs: endTs, startTs, endTs, inserted });
    }
    sendJson(socket, { type: 'importedData', logsImported: inserted });
    completed = true;
  } catch (error) {
    if (error && error.cancelled) {
      stopped = true;
      sendJson(socket, { type: 'importStopped', kind: 'logs' });
    } else {
      logMessage(fastify, 'warn', 'Torn log synchronization failed', { userId: session.userId, error: error.message });
      sendJson(socket, { type: 'importProgress', kind: 'logs', error: SAFE_ERRORS.IMPORT_FAILED });
    }
  } finally {
    socket.__importingLogs = false;
    if (socket.__stopImport) delete socket.__stopImport.logs;
    if (socket.__attacksWatchdog) {
      clearTimeout(socket.__attacksWatchdog);
      delete socket.__attacksWatchdog;
    }
    if (completed && !stopped && socket.__deferredTornAttacks) {
      socket.__deferredTornAttacks = false;
      socket.__autoTriggerAttacksAfterLogs = false;
      try { await require('./wsTornAttacks.cjs')(socket, req, fastify); } catch (error) {
        logMessage(fastify, 'warn', 'deferred attack synchronization failed', { error: error.message });
      }
    } else {
      // A stopped/failed log job must not leave a deferred attack job behind.
      socket.__deferredTornAttacks = false;
      socket.__autoTriggerAttacksAfterLogs = false;
    }
  }
};

module.exports.normalizeLog = normalizeLog;
