'use strict';

const { hasAuthenticatedCompanySession, sendJson, userDatabase, withRequestId } = require('../utils/companyAnalytics.cjs');

module.exports = async function wsGetCompanyProfile(socket, req, fastify, parsed = {}) {
  const base = { type: 'getCompanyProfile' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }
  try {
    const database = userDatabase(fastify, req);
    if (!database) throw new Error('database_unavailable');
    const documents = await database.collection('CompanyProfile').find({}, { projection: { _id: 0 }, sort: { timestamp: -1 } }).toArray();
    const latest = documents[0];
    sendJson(socket, withRequestId(latest?.company ? { ...base, ok: true, profile: latest.company, timestamp: Number.isFinite(latest.timestamp) ? latest.timestamp : null } : { ...base, ok: true, profile: null, timestamp: null, empty: true }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'getCompanyProfile' }, 'company snapshot unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
  }
};
