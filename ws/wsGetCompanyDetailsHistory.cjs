'use strict';

const {
  MAX_HISTORY_POINTS,
  canonicalSeries,
  hasAuthenticatedCompanySession,
  normalizeEpochMs,
  normalizePoint,
  normalizeRange,
  sendJson,
  userDatabase,
  withRequestId,
} = require('../utils/companyAnalytics.cjs');

const METRICS = ['employees', 'capacity', 'popularity', 'environment', 'efficiency', 'customers', 'daily_income', 'weekly_income'];

module.exports = async function wsGetCompanyDetailsHistory(socket, req, fastify, parsed = {}) {
  const base = { type: 'getCompanyDetailsHistory' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }
  const now = Date.now();
  const range = normalizeRange(parsed, { defaultFrom: now - 7 * 24 * 60 * 60 * 1000, defaultTo: now });
  if (!range) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'invalid_range' }, parsed));
    return;
  }

  try {
    const database = userDatabase(fastify, req);
    if (!database) throw new Error('database_unavailable');
    const query = { timestamp: { $gte: Math.floor(range.from / 1000), $lte: range.to } };
    const documents = await database.collection('CompanyDetails')
      .find(query, { projection: { _id: 0, timestamp: 1, details: 1 }, sort: { timestamp: 1 } })
      .toArray();
    const docs = documents
      .map(document => ({ document, timestamp: normalizeEpochMs(document?.timestamp) }))
      .filter(({ document, timestamp }) => document?.details && timestamp !== null && timestamp >= range.from && timestamp <= range.to)
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(0, MAX_HISTORY_POINTS);
    const rawSeries = Object.fromEntries(METRICS.map(metric => [metric, []]));
    for (const { document, timestamp } of docs) {
      for (const metric of METRICS) {
        const point = normalizePoint(timestamp, document.details[metric]);
        if (point) rawSeries[metric].push(point);
      }
    }
    const series = {};
    for (const [metric, points] of Object.entries(rawSeries)) {
      const canonical = canonicalSeries(points);
      if (canonical.length) series[metric] = canonical;
    }
    sendJson(socket, withRequestId({
      ...base,
      ok: true,
      series,
      lastTimestamp: docs.length ? docs.at(-1).timestamp : null,
      meta: { from: range.from, to: range.to, points: docs.length },
    }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'getCompanyDetailsHistory' }, 'company history unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'history_unavailable' }, parsed));
  }
};
