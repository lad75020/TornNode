'use strict';

const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  parseInteger,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');
const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey.cjs');

const CACHE_TTL_SECONDS = 86400;

function sendFailure(socket) {
  sendJson(socket, {
    type: 'updatePrice',
    ok: false,
    error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
  });
}

function isValidPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function getItemsDatabase(fastify) {
  if (!fastify || !fastify.mongo) throw new Error('items database unavailable');
  if (typeof fastify.mongo.db === 'function') return fastify.mongo.db('TORN');
  if (fastify.mongo.client && typeof fastify.mongo.client.db === 'function') return fastify.mongo.client.db('TORN');
  throw new Error('items database unavailable');
}

async function fetchMarketPrice(req, idInt) {
  const authenticated = getAuthenticatedSession(req, { requireApiKey: true });
  if (!authenticated.ok) throw new Error('market price authorization unavailable');

  const { TornAPI } = require('torn-client');
  const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
    ? process.env.TORN_API_URL.replace(/\/+$/, '')
    : undefined;
  const tornClient = new TornAPI({
    apiKeys: [authenticated.apiKey],
    ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
  });
  const data = await tornClient.market.withId(idInt).itemmarket({ offset: 0 });
  const listings = data && data.itemmarket ? data.itemmarket.listings : null;
  const firstListing = Array.isArray(listings) ? listings[0] : listings;
  const price = firstListing && typeof firstListing === 'object' ? firstListing.price : undefined;
  if (!isValidPrice(price)) throw new Error('market price unavailable');
  return price;
}

async function updateRedisItem(redisClient, item, idInt, fastify) {
  if (!redisClient || typeof redisClient.sendCommand !== 'function') return false;
  const itemKey = `${ITEMS_KEY_PREFIX}${idInt}`;
  try {
    await redisClient.sendCommand(['JSON.SET', itemKey, '$', JSON.stringify(item)]);
    if (typeof redisClient.expire === 'function') {
      await redisClient.expire(itemKey, CACHE_TTL_SECONDS);
    } else {
      await redisClient.sendCommand(['EXPIRE', itemKey, String(CACHE_TTL_SECONDS)]);
    }
    return true;
  } catch (error) {
    logMessage(fastify, 'warn', 'item price cache update failed', { key: itemKey, error: error.message });
    return false;
  }
}

async function logPriceVariation(redisClient, idInt, price, fastify) {
  if (!redisClient || typeof redisClient.rPush !== 'function') return;
  try {
    try {
      const { lastMinPrices } = require('./priceState.cjs');
      lastMinPrices.set(idInt, price);
    } catch (_) {}

    const now = new Date();
    const dayKey = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const listKey = `pricevars:${dayKey}:${idInt}`;
    await redisClient.rPush(listKey, JSON.stringify({ t: now.toISOString(), p: price }));
    if (typeof redisClient.ttl === 'function' && typeof redisClient.expire === 'function') {
      const ttl = await redisClient.ttl(listKey);
      if (ttl === -1) await redisClient.expire(listKey, 60 * 60 * 24 * 3);
    }
  } catch (error) {
    logMessage(fastify, 'debug', 'item price variation log failed', { error: error.message });
  }
}

module.exports = async function wsUpdatePrice(socket, req, fastify, parsed, redisClient) {
  const auth = getAuthenticatedSession(req);
  const idInt = parseInteger(parsed && parsed.id);
  if (!auth.ok || idInt === null || idInt <= 0) {
    sendFailure(socket);
    return;
  }

  const hasSuppliedPrice = Boolean(
    parsed && Object.prototype.hasOwnProperty.call(parsed, 'price') && parsed.price !== undefined,
  );

  try {
    const price = hasSuppliedPrice
      ? parsed.price
      : await fetchMarketPrice(req, idInt);
    if (!isValidPrice(price)) {
      throw new Error('invalid price');
    }

    const database = getItemsDatabase(fastify);
    const itemsCollection = database.collection('Items');
    const existingItem = await itemsCollection.findOne({ id: idInt });
    if (!existingItem) throw new Error('target item unavailable');

    const updateResult = await itemsCollection.updateOne(
      { id: idInt },
      { $set: { price } },
      { upsert: false },
    );
    if (!updateResult || Number(updateResult.matchedCount) !== 1) {
      throw new Error('target item was not updated');
    }

    const item = await itemsCollection.findOne({ id: idInt });
    if (!item) throw new Error('updated item unavailable');

    const cacheItem = { ...item, price };
    const cacheUpdated = await updateRedisItem(redisClient, cacheItem, idInt, fastify);
    await logPriceVariation(redisClient, idInt, price, fastify);

    sendJson(socket, {
      type: 'updatePrice',
      ok: true,
      id: idInt,
      price,
      cache: cacheUpdated ? 'json' : 'miss-json',
    });
  } catch (error) {
    logMessage(fastify, 'warn', 'item price update failed', {
      userId: auth.userId,
      id: idInt,
      error: error.message,
    });
    sendFailure(socket);
  }
};

module.exports.isValidPrice = isValidPrice;
