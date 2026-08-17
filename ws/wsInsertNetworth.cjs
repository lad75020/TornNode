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
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = async function wsInsertNetworth(req, fastify, socket) {
  const responseTime = Date.now();
  const authenticated = getAuthenticatedSession(req, { requireApiKey: true });
  if (!authenticated.ok) {
    sendJson(socket, {
      type: 'networthInsert',
      ok: false,
      inserted: false,
      error: authenticated.reason,
      time: responseTime,
    });
    return;
  }

  try {
    await ensureUserDbStructure(fastify, authenticated.userId, fastify && fastify.log);
    const collection = getUserDb(fastify, req).collection('Networth');
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const existingDocument = await collection.findOne({ date: { $gte: twelveHoursAgo } }, {
      projection: { _id: 0, date: 1 },
      sort: { date: -1 },
    });
    if (existingDocument) {
      const lastDate = toIsoDate(existingDocument.date);
      sendJson(socket, {
        type: 'networthInsert',
        ok: true,
        inserted: false,
        reason: 'recentEntryExists',
        message: 'Not inserting Networth (recent entry < 12h)',
        ...(lastDate ? { lastDate } : {}),
        time: responseTime,
      });
      return;
    }

    const { TornAPI } = require('torn-client');
    const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
      ? process.env.TORN_API_URL.replace(/\/+$/, '')
      : undefined;
    const tornClient = new TornAPI({
      apiKeys: [authenticated.apiKey],
      ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
    });
    const response = await tornClient.user.money();
    const value = finiteNumber(response && response.money && response.money.daily_networth);
    if (value === null) throw new Error('networth response missing finite value');

    const date = new Date();
    await collection.insertOne({ ...(response || {}), date });
    sendJson(socket, {
      type: 'networthInsert',
      ok: true,
      inserted: true,
      value,
      date: date.toISOString(),
      message: 'Networth inserted successfully',
      time: responseTime,
    });
  } catch (error) {
    logMessage(fastify, 'error', 'networth snapshot refresh failed', {
      userId: authenticated.userId,
      error: error && error.message,
    });
    sendJson(socket, {
      type: 'networthInsert',
      ok: false,
      inserted: false,
      error: SAFE_ERRORS.NETWORTH_REFRESH_FAILED,
      time: responseTime,
    });
  }
};
