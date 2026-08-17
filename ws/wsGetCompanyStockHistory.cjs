'use strict';

const {
  MAX_HISTORY_POINTS,
  canonicalSeries,
  hasAuthenticatedCompanySession,
  normalizeEpochMs,
  normalizeRange,
  normalizeStockItems,
  normalizeTop,
  sendJson,
  userDatabase,
  withRequestId,
} = require('../utils/companyAnalytics.cjs');

module.exports = async function wsGetCompanyStockHistory(socket, req, fastify, parsed = {}) {
  const base = { type: 'getCompanyStockHistory' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, parsed));
    return;
  }

  const now = Date.now();
  const range = normalizeRange(parsed, { defaultFrom: now - 24 * 60 * 60 * 1000, defaultTo: now });
  if (!range) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'invalid_range' }, parsed));
    return;
  }

  const top = normalizeTop(parsed.top);
  try {
    const database = userDatabase(fastify, req);
    if (!database) throw new Error('database_unavailable');
    const query = { timestamp: { $gte: Math.floor(range.from / 1000), $lte: range.to } };
    const documents = await database.collection('CompanyStock')
      .find(query, { projection: { _id: 0, timestamp: 1, stocks: 1, stock: 1 }, sort: { timestamp: 1 } })
      .toArray();
    const docs = documents
      .map(document => ({ document, timestamp: normalizeEpochMs(document?.timestamp) }))
      .filter(({ timestamp }) => timestamp !== null && timestamp >= range.from && timestamp <= range.to)
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(0, MAX_HISTORY_POINTS);

    const perItem = new Map();
    const totalInStock = [];
    for (const { document, timestamp } of docs) {
      const items = normalizeStockItems(document.stocks ?? document.stock);
      let total = 0;
      for (const item of items) {
        total += item.inStock;
        if (!perItem.has(item.name)) perItem.set(item.name, []);
        perItem.get(item.name).push({ t: timestamp, v: item.inStock, ...(item.price === undefined ? {} : { p: item.price }) });
      }
      totalInStock.push({ t: timestamp, v: total });
    }

    const latestItems = docs.length ? normalizeStockItems(docs.at(-1).document.stocks ?? docs.at(-1).document.stock) : [];
    let ranking = latestItems
      .toSorted((left, right) => right.inStock - left.inStock || left.name.localeCompare(right.name))
      .slice(0, top)
      .map(item => item.name);
    if (!ranking.length) {
      ranking = [...perItem.entries()]
        .map(([name, points]) => ({ name, count: points.length }))
        .toSorted((left, right) => right.count - left.count || left.name.localeCompare(right.name))
        .slice(0, top)
        .map(item => item.name);
    }

    const items = Object.fromEntries(ranking.map(name => [name, canonicalSeries(perItem.get(name))]));
    const series = { totalInStock: canonicalSeries(totalInStock), items };
    sendJson(socket, withRequestId({
      ...base,
      ok: true,
      series,
      meta: { from: range.from, to: range.to, points: docs.length, top, items: ranking.length },
    }, parsed));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'getCompanyStockHistory' }, 'company history unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'history_unavailable' }, parsed));
  }
};
