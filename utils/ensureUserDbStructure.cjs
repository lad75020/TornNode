'use strict';

const { normalizeUserId, logMessage } = require('./tornSyncHelpers.cjs');

const processed = new Set();
const REQUIRED_COLLECTIONS = ['logs', 'attacks', 'Networth', 'Stats'];

function isNamespaceExists(error) {
  return Boolean(error && (error.code === 48 || /namespace exists/i.test(String(error.message || ''))));
}

/**
 * Ensure the collections and indexes used by user-scoped synchronization exist.
 * Mongo collection/index creation is idempotent; the in-process cache only avoids
 * repeating the same work after a successful setup.
 */
module.exports = async function ensureUserDbStructure(fastify, userID, logger) {
  const normalizedUserId = normalizeUserId(userID);
  if (!normalizedUserId) throw new Error('invalid authenticated user');
  if (!fastify || !fastify.mongo) throw new Error('user database unavailable');
  const dbName = String(normalizedUserId);
  if (processed.has(dbName)) return { userId: normalizedUserId, cached: true };

  const mongo = fastify.mongo;
  const db = typeof mongo.db === 'function'
    ? mongo.db(dbName)
    : mongo.client && typeof mongo.client.db === 'function'
      ? mongo.client.db(dbName)
      : null;
  if (!db || typeof db.collection !== 'function') throw new Error('user database unavailable');

  try {
    let existingNames = new Set();
    if (typeof db.listCollections === 'function') {
      const listed = await db.listCollections({}, { nameOnly: true }).toArray();
      existingNames = new Set((listed || []).map(collection => collection.name));
    }

    for (const name of REQUIRED_COLLECTIONS) {
      if (existingNames.has(name) || typeof db.createCollection !== 'function') continue;
      try {
        await db.createCollection(name);
      } catch (error) {
        if (!isNamespaceExists(error)) throw error;
      }
    }

    const logs = db.collection('logs');
    const attacks = db.collection('attacks');
    const networth = db.collection('Networth');
    const stats = db.collection('Stats');
    if (typeof logs.createIndex === 'function') {
      await logs.createIndex({ timestamp: -1 }, { name: 'logs_timestamp_desc' });
      await logs.createIndex({ log: 1, timestamp: 1 }, { name: 'logs_type_timestamp' });
    }
    if (typeof attacks.createIndex === 'function') {
      try {
        await attacks.createIndex({ code: 1 }, { name: 'attacks_code_unique', unique: true });
      } catch (error) {
        // Existing historical duplicate attack codes must not make the whole
        // user's database unusable; retain a non-unique lookup index instead.
        logMessage(logger, 'warn', 'attack uniqueness index requires non-destructive fallback', { userId: normalizedUserId, error: error.message });
        try { await attacks.createIndex({ code: 1 }, { name: 'attacks_code_lookup' }); } catch (_) {}
      }
      await attacks.createIndex({ ended: -1 }, { name: 'attacks_ended_desc' });
    }
    if (typeof networth.createIndex === 'function') await networth.createIndex({ date: -1 }, { name: 'networth_date_desc' });
    if (typeof stats.createIndex === 'function') await stats.createIndex({ date: -1 }, { name: 'stats_date_desc' });

    processed.add(dbName);
    return { userId: normalizedUserId, cached: false };
  } catch (error) {
    logMessage(logger, 'warn', 'user database structure setup failed', { userId: normalizedUserId, error: error.message });
    throw new Error('user database setup failed');
  }
};

module.exports.REQUIRED_COLLECTIONS = REQUIRED_COLLECTIONS;
module.exports.clearCache = () => processed.clear();
