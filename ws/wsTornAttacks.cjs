'use strict';

const { TornAPI } = require('torn-client');
const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  DEFAULT_ATTACK_START,
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

const WINDOW_SECONDS = 86400;
const DEFAULT_SEGMENT_DELAY_MS = 4000;

function createClient(apiKey, options = {}) {
  if (options.tornClient) return options.tornClient;
  const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
    ? process.env.TORN_API_URL.replace(/\/+$/, '')
    : undefined;
  return new TornAPI({ apiKeys: [apiKey], ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}) });
}

function normalizeAttack(raw, sourceId) {
  if (!raw || typeof raw !== 'object') return null;
  const code = raw.code ?? sourceId;
  const started = Number(raw.started);
  const ended = Number(raw.ended);
  if (code === undefined || code === null || String(code).trim() === '') return null;
  if (!Number.isSafeInteger(started) || started < 0 || !Number.isSafeInteger(ended) || ended < 0) return null;
  return {
    ...raw,
    code: String(code),
    started,
    ended,
    date_started: new Date(started * 1000),
    date_ended: new Date(ended * 1000),
  };
}

async function insertAttack(collection, value) {
  // Prefer an atomic upsert when the driver exposes it. The unique code index
  // remains the final race-safe boundary for older collection implementations.
  if (typeof collection.updateOne === 'function') {
    const result = await collection.updateOne(
      { code: value.code },
      { $setOnInsert: value },
      { upsert: true },
    );
    return Boolean(result && (result.upsertedCount === 1 || result.upsertedId));
  }
  if (typeof collection.countDocuments === 'function' && await collection.countDocuments({ code: value.code }) > 0) return false;
  try {
    await collection.insertOne(value);
    return true;
  } catch (error) {
    if (isDuplicateError(error)) return false;
    throw error;
  }
}

module.exports = async function wsTornAttacks(socket, req, fastify, options = {}) {
  const managedByRouter = options.managedByRouter === true;
  const session = getAuthenticatedSession(req, { requireApiKey: true });
  if (!session.ok) {
    if (managedByRouter) {
      socket.__importingAttacks = false;
      if (socket.__stopImport) delete socket.__stopImport.attacks;
    }
    sendJson(socket, { type: 'importProgress', kind: 'attacks', error: SAFE_ERRORS.INVALID_SESSION });
    return;
  }

  if (socket.__importingAttacks && !managedByRouter) {
    sendJson(socket, { type: 'importProgress', kind: 'attacks', error: 'already_running', phase: 'rejected' });
    return;
  }
  if (!managedByRouter) socket.__importingAttacks = true;
  socket.__stopImport = socket.__stopImport || {};
  socket.__stopImport.attacks = false;

  let completed = false;
  let stopped = false;
  try {
    const range = parseRange(options, {
      defaultFrom: options.from === undefined ? DEFAULT_ATTACK_START : undefined,
      defaultTo: options.to === undefined ? Math.floor(Date.now() / 1000) : undefined,
    });
    if (!range.ok) {
      sendJson(socket, { type: 'importProgress', kind: 'attacks', error: SAFE_ERRORS.INVALID_RANGE });
      return;
    }

    const database = options.database || (await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log), getUserDb(fastify, req));
    const attacksCollection = database.collection('attacks');
    const client = createClient(session.apiKey, options);
    let startTs = range.from;
    if (options.from === undefined) {
      const lastDoc = await attacksCollection.findOne({}, { sort: { ended: -1 }, limit: 1 });
      const latest = lastDoc && Number(lastDoc.ended);
      startTs = Number.isSafeInteger(latest) ? latest + 1 : DEFAULT_ATTACK_START;
    }
    const endTs = range.to;
    if (startTs > endTs) {
      sendJson(socket, { type: 'importProgress', kind: 'attacks', percent: 100, currentTs: endTs, startTs, endTs, inserted: 0 });
      sendJson(socket, { type: 'importedData', attacksImported: 0, note: 'up-to-date' });
      completed = true;
      return;
    }

    const totalSeconds = Math.max(1, endTs - startTs + 1);
    let inserted = 0;
    let lastProgress = -1;
    const retryDelayMs = options.retryDelayMs == null ? Number(process.env.TORN_IMPORT_RETRY_DELAY_MS || 10000) : Number(options.retryDelayMs);
    const segmentDelayMs = options.segmentDelayMs == null ? DEFAULT_SEGMENT_DELAY_MS : Number(options.segmentDelayMs);

    sendJson(socket, { type: 'importProgress', kind: 'attacks', percent: 0, currentTs: startTs, startTs, endTs, inserted });
    for (let windowStart = startTs; windowStart <= endTs; windowStart += WINDOW_SECONDS) {
      if (socket.__stopImport.attacks || !socketUsable(socket)) {
        stopped = true;
        sendJson(socket, { type: 'importStopped', kind: 'attacks', startTs, endTs, inserted });
        return;
      }
      const windowEnd = Math.min(endTs, windowStart + WINDOW_SECONDS - 1);
      const response = await withRetries(
        () => client.user.attacks({ from: windowStart, to: windowEnd }),
        {
          maxAttempts: options.maxAttempts == null ? 3 : Number(options.maxAttempts),
          delayMs: retryDelayMs,
          shouldStop: () => socket.__stopImport.attacks || !socketUsable(socket),
          onRetry: (error, attempt) => logMessage(fastify, 'warn', 'Torn attack window retry', { from: windowStart, to: windowEnd, attempt, code: error && error.code }),
        },
      );
      const attackBlock = response && response.attacks && typeof response.attacks === 'object' ? response.attacks : {};
      for (const [sourceId, raw] of Object.entries(attackBlock)) {
        const value = normalizeAttack(raw, sourceId);
        if (!value) continue;
        if (await insertAttack(attacksCollection, value)) inserted += 1;
      }
      if (socket.__stopImport.attacks || !socketUsable(socket)) {
        stopped = true;
        sendJson(socket, { type: 'importStopped', kind: 'attacks', startTs, endTs, inserted });
        return;
      }

      const currentTs = windowEnd;
      const percent = Math.min(100, Math.max(0, ((currentTs - startTs + 1) / totalSeconds) * 100));
      if (percent - lastProgress >= 2 || percent >= 100) {
        lastProgress = percent;
        sendJson(socket, { type: 'importProgress', kind: 'attacks', percent: Number(percent.toFixed(1)), currentTs, startTs, endTs, inserted });
      }
      if (segmentDelayMs > 0) await sleep(segmentDelayMs);
    }

    if (lastProgress < 100) sendJson(socket, { type: 'importProgress', kind: 'attacks', percent: 100, currentTs: endTs, startTs, endTs, inserted });
    sendJson(socket, { type: 'importedData', attacksImported: inserted });
    completed = true;
  } catch (error) {
    if (error && error.cancelled) {
      stopped = true;
      sendJson(socket, { type: 'importStopped', kind: 'attacks' });
    } else {
      logMessage(fastify, 'warn', 'Torn attack synchronization failed', { userId: session.userId, error: error.message });
      sendJson(socket, { type: 'importProgress', kind: 'attacks', error: SAFE_ERRORS.IMPORT_FAILED });
    }
  } finally {
    socket.__importingAttacks = false;
    if (socket.__stopImport) delete socket.__stopImport.attacks;
    if (!completed && !stopped) socket.__deferredTornAttacks = false;
  }
};

module.exports.normalizeAttack = normalizeAttack;
