'use strict';

const fetchOrReuseSnapshot = require('../utils/fetchOrReuseSnapshot.cjs');
const { hasAuthenticatedCompanySession, sendJson, withRequestId } = require('../utils/companyAnalytics.cjs');

module.exports = async function wsCompanyStock(socket, req, fastify, parsed = {}) {
  const base = { type: 'companyStock' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }
  try {
    const apiKey = req.session.TornAPIKey;
    const result = await fetchOrReuseSnapshot(fastify, {
      collection: 'CompanyStock',
      url: `https://api.torn.com/company/111803?key=${apiKey}&comment=ReactTorn&selections=stock`,
      extract: response => response.company_stock,
      fieldName: 'stocks',
      reuseWindowMs: 12 * 60 * 60 * 1000,
      databaseName: String(req.session.userId),
    });
    if (result?.error) {
      sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
      return;
    }
    sendJson(socket, withRequestId({
      ...base,
      ok: true,
      stock: result?.data ?? null,
      timestamp: Number.isFinite(result?.timestamp) ? result.timestamp : null,
      reused: Boolean(result?.reused),
      inserted: Boolean(result?.inserted),
      ...(result?.stale ? { stale: true } : {}),
      ...(result?.data == null ? { empty: true } : {}),
    }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'companyStock' }, 'company snapshot unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'snapshot_unavailable' }, parsed));
  }
};
