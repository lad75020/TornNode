'use strict';

const { hasAuthenticatedCompanySession, sendJson, userDatabase, withRequestId } = require('../utils/companyAnalytics.cjs');

module.exports = async function wsGetCompanyStock(socket, req, fastify, parsed = {}) {
  const base = { type: 'getCompanyStock' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }
  try {
    const database = userDatabase(fastify, req);
    if (!database) throw new Error('database_unavailable');
    const document = await database.collection('CompanyStock').find({}, { projection: { _id: 0 }, sort: { timestamp: -1 } }).toArray();
    const latest = document[0];
    sendJson(socket, withRequestId(latest ? { ...base, ok: true, stock: latest.stocks ?? latest.stock ?? null, timestamp: Number.isFinite(latest.timestamp) ? latest.timestamp : null } : { ...base, ok: true, stock: null, timestamp: null, empty: true }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'getCompanyStock' }, 'company snapshot unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
  }
};
