'use strict';

const { normalizeItemId, positiveFiniteNumber } = require('../utils/bazaarMarket.cjs');
const { SAFE_ERRORS } = require('../utils/tornSyncHelpers.cjs');
const SAFE_HISTORY_ERROR = SAFE_ERRORS.MARKET_HISTORY_FAILED;
const PUBLIC_RESPONSE_CACHE_TTL_MS = 30_000;
const publicHistoryCache = new WeakMap();

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function normalizeHistoryDate(raw) {
  let value = raw;
  if (value && typeof value === 'object') {
    value = value.$date !== undefined ? value.$date : value.date;
  }
  let date;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    date = new Date(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
    const isoDay = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed);
    const calendarParts = compact || isoDay;
    if (calendarParts) {
      const year = Number(calendarParts[1]);
      const month = Number(calendarParts[2]);
      const day = Number(calendarParts[3]);
      if (!isValidCalendarDate(year, month, day)) return null;
    }
    if (compact) {
      date = new Date(Date.UTC(
        Number(compact[1]),
        Number(compact[2]) - 1,
        Number(compact[3]),
      ));
    } else {
      date = new Date(trimmed.replace(' ', 'T'));
    }
  } else {
    return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return day > today ? null : day;
}

function normalizeHistoryLine(doc) {
  const id = normalizeItemId(doc && doc.id);
  if (id === null) return null;
  const pointsByDay = new Map();
  const source = Array.isArray(doc.dailyPriceAverages) ? doc.dailyPriceAverages : [];
  for (const point of source) {
    if (!point || typeof point !== 'object') continue;
    const date = normalizeHistoryDate(point.date);
    const avg = positiveFiniteNumber(point.avg);
    if (!date || avg === null || pointsByDay.has(date)) continue;
    pointsByDay.set(date, { date, avg });
  }
  const points = [...pointsByDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length) return null;
  return {
    id,
    name: typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : String(id),
    points,
  };
}

module.exports = async function wsDailyPriceAverages(socket, req, fastify) {
  try {
    const cacheOwner = typeof fastify === 'object' && fastify !== null ? fastify : null;
    if (cacheOwner) {
      const cached = publicHistoryCache.get(cacheOwner);
      if (cached && Date.now() - cached.cachedAt < PUBLIC_RESPONSE_CACHE_TTL_MS) {
        try { socket.send(JSON.stringify({ type: 'dailyPriceAveragesAll', ok: true, lines: cached.lines })); } catch (_) {}
        return;
      }
    }

    const database = typeof fastify?.mongo?.db === 'function'
      ? fastify.mongo.db('TORN')
      : fastify?.mongo?.client?.db('TORN');
    if (!database || typeof database.collection !== 'function') throw new Error('history database unavailable');
    const collection = database.collection('Items');
    const cursor = collection.find(
      { dailyPriceAverages: { $exists: true, $type: 'array', $ne: [] } },
      { projection: { id: 1, name: 1, dailyPriceAverages: 1, _id: 0 } },
    );
    const lines = [];
    while (await cursor.hasNext()) {
      const line = normalizeHistoryLine(await cursor.next());
      if (line) lines.push(line);
    }
    lines.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id);
    if (cacheOwner) publicHistoryCache.set(cacheOwner, { cachedAt: Date.now(), lines });
    try { socket.send(JSON.stringify({ type: 'dailyPriceAveragesAll', ok: true, lines })); } catch (_) {}
  } catch (error) {
    try { fastify?.log?.error({ error: error.message }, '[wsDailyPriceAverages] history read failed'); } catch (_) {}
    try { socket.send(JSON.stringify({ type: 'dailyPriceAveragesAll', ok: false, error: SAFE_HISTORY_ERROR })); } catch (_) {}
  }
};

module.exports.normalizeHistoryDate = normalizeHistoryDate;
module.exports.normalizeHistoryLine = normalizeHistoryLine;
module.exports.SAFE_HISTORY_ERROR = SAFE_HISTORY_ERROR;
