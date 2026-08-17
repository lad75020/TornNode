'use strict';

const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function snapshotValue(document) {
  const directValue = finiteNumber(document && document.value);
  if (directValue !== null) return directValue;
  return finiteNumber(document && document.money && document.money.daily_networth);
}

module.exports = async function wsGetNetworth(socket, req, fastify) {
  const authenticated = getAuthenticatedSession(req, { requireApiKey: true });
  if (!authenticated.ok) {
    sendJson(socket, { type: 'getNetworth', error: authenticated.reason });
    return;
  }

  let cursor;
  try {
    await ensureUserDbStructure(fastify, authenticated.userId, fastify && fastify.log);
    const collection = getUserDb(fastify, req).collection('Networth');
    cursor = collection.find({}, { projection: { _id: 0, date: 1, value: 1, 'money.daily_networth': 1 } });
    const documents = typeof cursor.toArray === 'function' ? await cursor.toArray() : [];
    const points = documents
      .map(document => {
        const date = toIsoDate(document && document.date);
        const value = snapshotValue(document);
        return date && value !== null ? { date, value } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.date.localeCompare(right.date) || left.value - right.value);

    const data = [];
    for (const point of points) {
      if (data.length === 0 || data[data.length - 1].date !== point.date) data.push(point);
    }
    sendJson(socket, { type: 'getNetworth', data });
  } catch (error) {
    logMessage(fastify, 'error', 'networth history retrieval failed', {
      userId: authenticated.userId,
      error: error && error.message,
    });
    sendJson(socket, { type: 'getNetworth', error: SAFE_ERRORS.NETWORTH_RETRIEVAL_FAILED });
  } finally {
    if (cursor && typeof cursor.close === 'function') {
      try { await cursor.close(); } catch (_) {}
    }
  }
};
