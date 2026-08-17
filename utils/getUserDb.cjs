'use strict';

const { normalizeUserId } = require('./tornSyncHelpers.cjs');

/**
 * Return the Mongo database selected by the authenticated server session.
 * Request payloads are intentionally not accepted here as a tenant selector.
 */
module.exports = function getUserDb(fastify, req) {
  if (!fastify || !fastify.mongo) throw new Error('user database unavailable');
  const userId = normalizeUserId(req && req.session && req.session.userId);
  if (!userId) throw new Error('invalid authenticated user');

  const mongo = fastify.mongo;
  if (typeof mongo.db === 'function') return mongo.db(String(userId));
  if (mongo.client && typeof mongo.client.db === 'function') return mongo.client.db(String(userId));
  throw new Error('user database unavailable');
};

module.exports.normalizeUserId = normalizeUserId;
