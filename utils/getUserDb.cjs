// getUserDb.js
// Retourne la DB Mongo spécifique à l'utilisateur (par userID) depuis fastify.mongo.
module.exports = function getUserDb(fastify, req) {
  if (!fastify || !fastify.mongo) throw new Error('fastify.mongo missing');
  if (!req || !req.session || !Number.isFinite(req.session.userId)) throw new Error('missing userId in session');
  const dbName = String(req.session.userId).trim();
  if (!dbName) throw new Error('empty userId');
  const mongo = fastify.mongo;
  const db = typeof mongo.db === 'function' ? mongo.db(dbName) : mongo.client.db(dbName);
  return db;
};
