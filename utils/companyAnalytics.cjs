'use strict';

const SECOND_EPOCH_CUTOFF = 10_000_000_000;
const MAX_HISTORY_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_POINTS = 5_000;
const MAX_TOP_ITEMS = 50;

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeEpochMs(value) {
  const numeric = finiteNumber(value);
  if (numeric === null || numeric < 0) return null;
  const milliseconds = numeric < SECOND_EPOCH_CUTOFF ? numeric * 1000 : numeric;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function normalizeRange(input = {}, { defaultFrom, defaultTo, maxRangeMs = MAX_HISTORY_RANGE_MS } = {}) {
  const hasFrom = Object.prototype.hasOwnProperty.call(input, 'from') && input.from != null;
  const hasTo = Object.prototype.hasOwnProperty.call(input, 'to') && input.to != null;
  let from = hasFrom ? normalizeEpochMs(input.from) : normalizeEpochMs(defaultFrom);
  let to = hasTo ? normalizeEpochMs(input.to) : normalizeEpochMs(defaultTo);
  if (from === null || to === null) return null;
  if (from > to) [from, to] = [to, from];
  if (to - from > maxRangeMs) return null;
  return { from, to };
}

function normalizePoint(timestamp, value, price) {
  const t = normalizeEpochMs(timestamp);
  const v = finiteNumber(value);
  if (t === null || v === null) return null;
  const point = { t, v };
  if (price !== undefined && price !== null) {
    const p = finiteNumber(price);
    if (p !== null) point.p = p;
  }
  return point;
}

function canonicalSeries(points, limit = MAX_HISTORY_POINTS) {
  if (!Array.isArray(points)) return [];
  const cappedLimit = Math.max(0, Math.min(MAX_HISTORY_POINTS, Number.isSafeInteger(limit) ? limit : MAX_HISTORY_POINTS));
  const normalized = [];
  for (const point of points) {
    const canonical = normalizePoint(point?.t, point?.v, point?.p);
    if (canonical) normalized.push(canonical);
  }
  normalized.sort((left, right) => left.t - right.t);
  return normalized.slice(0, cappedLimit);
}

function normalizeStockItems(rawStock) {
  const entries = Array.isArray(rawStock)
    ? rawStock.map((value, index) => [String(index), value])
    : rawStock && typeof rawStock === 'object' ? Object.entries(rawStock) : [];
  const items = [];
  for (const [fallbackName, rawItem] of entries) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const name = rawItem.name || rawItem.item || rawItem.item_name || fallbackName;
    const inStock = finiteNumber(rawItem.in_stock);
    if (typeof name !== 'string' || !name || inStock === null) continue;
    const price = finiteNumber(rawItem.price);
    items.push({ name, inStock, ...(price === null ? {} : { price }) });
  }
  return items;
}

function normalizeTop(value, fallback = 5) {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_TOP_ITEMS, parsed));
}

function requestIdFrom(input) {
  const value = input?.requestId;
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  return value;
}

function withRequestId(payload, input) {
  const requestId = requestIdFrom(input);
  return requestId ? { ...payload, requestId } : payload;
}

function sendJson(socket, payload) {
  try { socket.send(JSON.stringify(payload)); } catch (_) {}
}

function userDatabase(fastify, req) {
  const userId = req?.session?.userId;
  if (userId === undefined || userId === null || String(userId).trim() === '') return null;
  const name = String(userId);
  if (typeof fastify?.mongo?.db === 'function') return fastify.mongo.db(name);
  if (typeof fastify?.mongo?.client?.db === 'function') return fastify.mongo.client.db(name);
  return null;
}

function hasAuthenticatedCompanySession(req) {
  return Boolean(req?.session?.TornAPIKey && req?.session?.userId !== undefined && req?.session?.userId !== null);
}

module.exports = {
  MAX_HISTORY_POINTS,
  MAX_HISTORY_RANGE_MS,
  MAX_TOP_ITEMS,
  canonicalSeries,
  finiteNumber,
  hasAuthenticatedCompanySession,
  normalizeEpochMs,
  normalizePoint,
  normalizeRange,
  normalizeStockItems,
  normalizeTop,
  requestIdFrom,
  sendJson,
  userDatabase,
  withRequestId,
};
