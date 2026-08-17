'use strict';

const fetchOrReuseSnapshot = require('../utils/fetchOrReuseSnapshot.cjs');
const { hasAuthenticatedCompanySession, sendJson, withRequestId } = require('../utils/companyAnalytics.cjs');

module.exports = async function wsCompanyDetails(socket, req, fastify, parsed = {}) {
  const base = { type: 'companyDetails' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }
  const requestedMinutes = Number(parsed?.reuseMinutes);
  const reuseWindowMs = parsed?.force === true || parsed?.forceFetch === true
    ? 0
    : Number.isFinite(requestedMinutes) && requestedMinutes >= 0 && requestedMinutes <= 720
      ? requestedMinutes * 60 * 1000
      : 12 * 60 * 60 * 1000;
  try {
    const apiKey = req.session.TornAPIKey;
    const result = await fetchOrReuseSnapshot(fastify, {
      collection: 'CompanyDetails',
      url: `https://api.torn.com/company/111803?key=${apiKey}&comment=ReactTorn&selections=detailed`,
      extract: response => response.company_detailed,
      fieldName: 'details',
      reuseWindowMs,
      databaseName: String(req.session.userId),
    });
    if (result?.error) {
      sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
      return;
    }
    sendJson(socket, withRequestId({
      ...base,
      ok: true,
      details: result?.data ?? null,
      timestamp: Number.isFinite(result?.timestamp) ? result.timestamp : null,
      reused: Boolean(result?.reused),
      inserted: Boolean(result?.inserted),
      ...(result?.stale ? { stale: true } : {}),
      ...(result?.data == null ? { empty: true } : {}),
    }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'companyDetails' }, 'company snapshot unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
  }
};
