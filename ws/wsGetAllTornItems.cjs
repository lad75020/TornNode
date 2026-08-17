'use strict';

const {
  ITEMS_KEY_PREFIX,
  REQUIRED_ITEM_FIELDS,
} = require('../utils/itemsCacheKey.cjs');
const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  parseInteger,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const CACHE_TTL_SECONDS = 86400;
const CACHE_CHUNK_SIZE = 200;

function isCompleteItem(item) {
  if (!item || typeof item !== 'object') return false;
  const id = parseInteger(item.id);
  if (id === null || id <= 0) return false;
  return REQUIRED_ITEM_FIELDS.every(field => item[field] !== undefined && item[field] !== null)
    && typeof item.name === 'string'
    && Number.isFinite(item.price)
    && item.price >= 0
    && typeof item.img64 === 'string'
    && typeof item.description === 'string';
}

function unwrapRedisValue(value) {
  if (Array.isArray(value) && value.length === 2 && (value[0] === null || value[0] instanceof Error || typeof value[0] === 'string')) return value[1];
  return value;
}

function parseRedisItem(value) {
  value = unwrapRedisValue(value);
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    return isCompleteItem(item) ? item : null;
  } catch (_) {
    return null;
  }
}

async function scanKeys(redisClient) {
  const keys = [];
  let cursor = '0';
  do {
    let reply;
    try {
      reply = await redisClient.scan(cursor, { MATCH: `${ITEMS_KEY_PREFIX}*`, COUNT: 400 });
    } catch (_) {
      reply = await redisClient.scan(cursor, 'MATCH', `${ITEMS_KEY_PREFIX}*`, 'COUNT', '400');
    }
    if (Array.isArray(reply)) {
      cursor = String(reply[0] ?? '0');
      if (Array.isArray(reply[1])) keys.push(...reply[1]);
    } else if (reply && typeof reply === 'object') {
      cursor = String(reply.cursor ?? '0');
      if (Array.isArray(reply.keys)) keys.push(...reply.keys);
    } else {
      cursor = '0';
    }
  } while (cursor !== '0');
  return keys;
}

async function readCachedItems(redisClient) {
  if (!redisClient || typeof redisClient.scan !== 'function') return null;
  const keys = await scanKeys(redisClient);
  if (keys.length === 0) return null;
  const rawValues = [];
  if (typeof redisClient.multi === 'function') {
    const multi = redisClient.multi();
    for (const key of keys) {
      const command = ['JSON.GET', key, '$'];
      if (typeof multi.addCommand === 'function') multi.addCommand(command);
      else if (typeof multi.sendCommand === 'function') multi.sendCommand(command);
    }
    const result = await multi.exec();
    if (Array.isArray(result)) rawValues.push(...result);
  } else if (typeof redisClient.sendCommand === 'function') {
    for (const key of keys) rawValues.push(await redisClient.sendCommand(['JSON.GET', key, '$']));
  }
  const items = rawValues.map(parseRedisItem).filter(Boolean);
  if (items.length !== keys.length || items.some(item => !isCompleteItem(item))) return null;
  return items;
}

function getCatalogDatabase(fastify) {
  if (!fastify || !fastify.mongo) throw new Error('catalog database unavailable');
  if (typeof fastify.mongo.db === 'function') return fastify.mongo.db('TORN');
  if (fastify.mongo.client && typeof fastify.mongo.client.db === 'function') return fastify.mongo.client.db('TORN');
  throw new Error('catalog database unavailable');
}

async function writeCachedItems(redisClient, documents, fastify) {
  if (!redisClient || documents.length === 0) return;
  for (let offset = 0; offset < documents.length; offset += CACHE_CHUNK_SIZE) {
    const chunk = documents.slice(offset, offset + CACHE_CHUNK_SIZE);
    if (typeof redisClient.multi === 'function') {
      const multi = redisClient.multi();
      for (const item of chunk) {
        const key = `${ITEMS_KEY_PREFIX}${item.id}`;
        const setCommand = ['JSON.SET', key, '$', JSON.stringify(item)];
        const expireCommand = ['EXPIRE', key, String(CACHE_TTL_SECONDS)];
        if (typeof multi.addCommand === 'function') {
          multi.addCommand(setCommand);
          multi.addCommand(expireCommand);
        } else if (typeof multi.sendCommand === 'function') {
          multi.sendCommand(setCommand);
          multi.sendCommand(expireCommand);
        }
      }
      await multi.exec();
    } else if (typeof redisClient.sendCommand === 'function') {
      for (const item of chunk) {
        const key = `${ITEMS_KEY_PREFIX}${item.id}`;
        await redisClient.sendCommand(['JSON.SET', key, '$', JSON.stringify(item)]);
        try { await redisClient.sendCommand(['EXPIRE', key, String(CACHE_TTL_SECONDS)]); } catch (_) {}
      }
    }
    logMessage(fastify, 'debug', 'item catalog cache repopulation progress', { sent: Math.min(offset + chunk.length, documents.length), total: documents.length });
  }
}

module.exports = async function wsGetAllTornItems(socket, req, fastify) {
  const session = getAuthenticatedSession(req, { requireApiKey: true });
  if (!session.ok) {
    sendJson(socket, { type: 'getAllTornItems', ok: false, error: SAFE_ERRORS.ITEM_CATALOG_FAILED });
    return;
  }

  try {
    const redisClient = fastify && fastify.redis;
    let items = null;
    try { items = await readCachedItems(redisClient); } catch (error) {
      logMessage(fastify, 'warn', 'item catalog cache read failed', { error: error.message });
    }
    if (items && items.length > 0) {
      sendJson(socket, { type: 'getAllTornItems', ok: true, items });
      return;
    }

    const database = getCatalogDatabase(fastify);
    const itemsCollection = database.collection('Items');
    const documents = await itemsCollection.find({}, { projection: { _id: 0 } }).toArray();
    if (!Array.isArray(documents) || documents.length === 0 || documents.some(item => !isCompleteItem(item))) {
      throw new Error('authoritative item catalog is incomplete');
    }
    await writeCachedItems(redisClient, documents, fastify);
    sendJson(socket, { type: 'getAllTornItems', ok: true, items: documents });
  } catch (error) {
    logMessage(fastify, 'warn', 'item catalog synchronization failed', { userId: session.userId, error: error.message });
    sendJson(socket, { type: 'getAllTornItems', ok: false, error: SAFE_ERRORS.ITEM_CATALOG_FAILED });
  }
};

module.exports.isCompleteItem = isCompleteItem;
module.exports.parseRedisItem = parseRedisItem;
module.exports.readCachedItems = readCachedItems;
