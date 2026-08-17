'use strict';

const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const NETWORTH_PARTS = Object.freeze([
  ['networthwallet', 'wallet'],
  ['networthvault', 'vaults'],
  ['networthbank', 'bank'],
  ['networthcayman', 'overseas_bank'],
  ['networthpoints', 'points'],
  ['networthitems', 'inventory'],
  ['networthdisplaycase', 'displaycase'],
  ['networthbazaar', 'bazaar'],
  ['networthitemmarket', 'item_market'],
  ['networthproperties', 'property'],
  ['networthstockmarket', 'stock_market'],
  ['networthauctionhouse', 'auction_house'],
  ['networthbookie', 'bookie'],
  ['networthcompany', 'company'],
  ['networthenlistedcars', 'enlisted_cars'],
  ['networthpiggybank', 'piggy_bank'],
  ['networthpending', 'pending'],
]);

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

module.exports = async function wsLastNetworthStats(socket, req, fastify) {
  const authenticated = getAuthenticatedSession(req, { requireApiKey: true });
  if (!authenticated.ok) {
    sendJson(socket, { type: 'lastNetworth', error: authenticated.reason });
    return;
  }

  try {
    await ensureUserDbStructure(fastify, authenticated.userId, fastify && fastify.log);
    const collection = getUserDb(fastify, req).collection('Stats');
    const document = await collection.findOne({}, {
      projection: { _id: 0, date: 1, 'personalstats.networth': 1 },
      sort: { date: -1 },
    });
    const date = toIsoDate(document && document.date);
    const source = document && document.personalstats && document.personalstats.networth;
    if (!date || !source || typeof source !== 'object') {
      sendJson(socket, { type: 'lastNetworth', error: SAFE_ERRORS.LATEST_NETWORTH_FAILED });
      return;
    }

    const networth = {};
    for (const [responseKey, sourceKey] of NETWORTH_PARTS) {
      const value = finiteNumber(source[sourceKey]);
      if (value !== null) networth[responseKey] = value;
    }
    if (Object.keys(networth).length === 0) {
      sendJson(socket, { type: 'lastNetworth', error: SAFE_ERRORS.LATEST_NETWORTH_FAILED });
      return;
    }
    sendJson(socket, { type: 'lastNetworth', date, networth });
  } catch (error) {
    logMessage(fastify, 'error', 'latest networth retrieval failed', {
      userId: authenticated.userId,
      error: error && error.message,
    });
    sendJson(socket, { type: 'lastNetworth', error: SAFE_ERRORS.LATEST_NETWORTH_FAILED });
  }
};
