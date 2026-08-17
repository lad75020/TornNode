'use strict';

const DEFAULT_LOG_START = 1716574649;
const DEFAULT_ATTACK_START = 1716757478;
const SAFE_ERRORS = Object.freeze({
  INVALID_SESSION: 'Invalid session',
  INVALID_RANGE: 'Invalid synchronization range',
  IMPORT_FAILED: 'Synchronization could not be completed. Please retry.',
  LOG_RETRIEVAL_FAILED: 'Log retrieval could not be completed. Please retry.',
  ATTACK_RETRIEVAL_FAILED: 'Attack retrieval could not be completed. Please retry.',
  ITEM_CATALOG_FAILED: 'Item catalog could not be loaded. Please retry.',
  ITEM_PRICE_UPDATE_FAILED: 'Item price could not be updated. Please retry.',
  MARKET_HISTORY_FAILED: 'Market history could not be loaded. Please retry.',
  SOCKET_UNUSABLE: 'The connection is no longer available.',
});

function normalizeUserId(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return number;
}

function getAuthenticatedSession(req, { requireApiKey = false } = {}) {
  const session = req && req.session;
  const userId = normalizeUserId(session && session.userId);
  if (!userId) return { ok: false, reason: SAFE_ERRORS.INVALID_SESSION };
  if (requireApiKey && typeof session.TornAPIKey !== 'string' && !(session.TornAPIKey instanceof String)) {
    return { ok: false, reason: SAFE_ERRORS.INVALID_SESSION };
  }
  if (requireApiKey && String(session.TornAPIKey).trim() === '') {
    return { ok: false, reason: SAFE_ERRORS.INVALID_SESSION };
  }
  return { ok: true, userId, apiKey: requireApiKey ? String(session.TornAPIKey) : undefined };
}

function parseInteger(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function parseRange(payload = {}, { defaultFrom, defaultTo = Math.floor(Date.now() / 1000) } = {}) {
  const hasFrom = payload.from !== undefined && payload.from !== null && payload.from !== '';
  const hasTo = payload.to !== undefined && payload.to !== null && payload.to !== '';
  const from = hasFrom ? parseInteger(payload.from) : parseInteger(defaultFrom);
  const to = hasTo ? parseInteger(payload.to) : parseInteger(defaultTo);
  if (from === null || to === null || from < 0 || to < 0 || from > to) {
    return { ok: false, reason: SAFE_ERRORS.INVALID_RANGE };
  }
  return { ok: true, from, to };
}

function sendJson(socket, payload) {
  if (!socket || typeof socket.send !== 'function') return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (_) {
    return false;
  }
}

function socketUsable(socket) {
  if (!socket) return false;
  if (typeof socket.readyState === 'number' && socket.readyState !== 1) return false;
  return typeof socket.send === 'function';
}

function logMessage(fastify, level, message, details) {
  try {
    const logger = fastify && fastify.log;
    if (!logger || typeof logger[level] !== 'function') return;
    if (details === undefined) logger[level](message);
    else logger[level](details, message);
  } catch (_) {}
}

function isDuplicateError(error) {
  return Boolean(error && (error.code === 11000 || /duplicate key|already exists/i.test(String(error.message || ''))));
}

function isRetryableApiError(error) {
  const code = error && (error.code ?? error.statusCode ?? error.status);
  const numericCode = Number(code);
  if ([429, 500, 502, 503, 504, 5].includes(numericCode)) return true;
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(String(code));
}

async function sleep(ms) {
  if (!ms || ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetries(task, {
  maxAttempts = 3,
  delayMs = Number(process.env.TORN_IMPORT_RETRY_DELAY_MS || 10000),
  isRetryable = isRetryableApiError,
  shouldStop = () => false,
  onRetry,
} = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    if (shouldStop()) throw Object.assign(new Error('cancelled'), { cancelled: true });
    attempt += 1;
    try {
      const response = await task(attempt);
      if (response && response.error) {
        const error = new Error(String(response.error.error || response.error.message || 'Torn API error'));
        error.code = response.error.code;
        throw error;
      }
      return response;
    } catch (error) {
      if (error && error.cancelled) throw error;
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      logMessage(null, 'warn', 'retrying Torn synchronization request', { attempt, code: error && error.code });
      if (typeof onRetry === 'function') onRetry(error, attempt);
      await sleep(delayMs * attempt);
    }
  }
  throw new Error('retry attempts exhausted');
}

module.exports = {
  DEFAULT_LOG_START,
  DEFAULT_ATTACK_START,
  SAFE_ERRORS,
  normalizeUserId,
  getAuthenticatedSession,
  parseInteger,
  parseRange,
  sendJson,
  socketUsable,
  logMessage,
  isDuplicateError,
  isRetryableApiError,
  sleep,
  withRetries,
};
