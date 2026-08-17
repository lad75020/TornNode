'use strict';

const {
  hasAuthenticatedCompanySession,
  finiteNumber,
  sendJson,
  userDatabase,
  withRequestId,
} = require('../utils/companyAnalytics.cjs');

const MAX_TRAINING_RANGE_SECONDS = 366 * 24 * 60 * 60;
const TRAINING_LOG_TYPES = [6264, 6220, 6221, 5963];

function normalizeEpochSeconds(value) {
  const numeric = finiteNumber(value);
  if (numeric === null || numeric < 0) return null;
  const seconds = numeric >= 10_000_000_000 ? numeric / 1000 : numeric;
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function normalizeTrainingRange(payload) {
  const from = normalizeEpochSeconds(payload?.from);
  const to = normalizeEpochSeconds(payload?.to);
  if (from === null || to === null || from >= to || to - from > MAX_TRAINING_RANGE_SECONDS) return null;
  return { from, to };
}

function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function statValue(value) {
  if (typeof value === 'string') value = value.replace(/[,\s]/g, '');
  return finiteNumber(value) ?? 0;
}

function dailyRow(day) {
  return { date: day, manual: 0, intelligence: 0, endurance: 0, trains: 0 };
}

module.exports = async function wsCompanyTrainRange(socket, req, fastify, payload = {}) {
  const base = { type: 'companyTrainRange' };
  if (!hasAuthenticatedCompanySession(req)) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'unauthorized' }, payload));
    return;
  }
  const range = normalizeTrainingRange(payload);
  if (!range) {
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'invalid_range' }, payload));
    return;
  }

  try {
    const database = userDatabase(fastify, req);
    if (!database) throw new Error('database_unavailable');
    const dayMap = new Map();
    const cursor = database.collection('logs').find({
      timestamp: { $gte: range.from, $lte: range.to },
      log: { $in: TRAINING_LOG_TYPES },
    }, {
      sort: { timestamp: 1 },
      projection: { timestamp: 1, 'data.working_stats_received': 1, log: 1 },
    });
    for await (const document of cursor) {
      const timestamp = normalizeEpochSeconds(document?.timestamp);
      if (timestamp === null || timestamp < range.from || timestamp > range.to || !TRAINING_LOG_TYPES.includes(document?.log)) continue;
      const day = utcDay(timestamp * 1000);
      if (!day) continue;
      const row = dayMap.get(day) || dailyRow(day);
      const parts = String(document?.data?.working_stats_received || '').split(',');
      row.manual += statValue(parts[0]);
      row.intelligence += statValue(parts[1]);
      row.endurance += statValue(parts[2]);
      if (document.log === 6264) row.trains += 1;
      dayMap.set(day, row);
    }

    try {
      const statsCursor = database.collection('Stats').find({}, {
        projection: {
          date: 1,
          'personalstats.jobs.stats.manual': 1,
          'personalstats.jobs.stats.intelligence': 1,
          'personalstats.jobs.stats.endurance': 1,
        },
      });
      for await (const document of statsCursor) {
        const day = utcDay(document?.date);
        if (!day) continue;
        const dayEpoch = Date.parse(`${day}T00:00:00.000Z`) / 1000;
        if (dayEpoch < range.from - 86_400 || dayEpoch > range.to) continue;
        const row = dayMap.get(day) || { ...dailyRow(day), abs: true };
        row.manual = statValue(document?.personalstats?.jobs?.stats?.manual);
        row.intelligence = statValue(document?.personalstats?.jobs?.stats?.intelligence);
        row.endurance = statValue(document?.personalstats?.jobs?.stats?.endurance);
        row.abs = true;
        dayMap.set(day, row);
      }
    } catch (_) {
      try { fastify?.log?.warn({ handler: 'companyTrainRange', source: 'Stats' }, 'training stats overlay unavailable'); } catch (_) {}
    }

    const data = [...dayMap.values()].toSorted((left, right) => left.date.localeCompare(right.date));
    sendJson(socket, withRequestId({ ...base, ok: true, from: range.from, to: range.to, data }, payload));
  } catch (_) {
    try { fastify?.log?.warn({ handler: 'companyTrainRange' }, 'training range unavailable'); } catch (_) {}
    sendJson(socket, withRequestId({ ...base, ok: false, error: 'training_range_unavailable' }, payload));
  }
};

module.exports.normalizeTrainingRange = normalizeTrainingRange;
