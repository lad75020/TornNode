'use strict';

const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const STATS_REFRESH_FAILED = 'Statistics could not be refreshed. Please retry.';
const STATS_TEST_FAILED = 'Statistics test could not be completed. Please retry.';

module.exports = async function wsStats(socket, req, fastify, options = {}) {
  const makeSend = (payload) => {
    try {
      if (typeof payload === 'string') socket.send(payload);
      else socket.send(JSON.stringify(payload));
    } catch (_) {
      // The socket may have closed while the asynchronous operation was running.
    }
  };
  const dryRun = Boolean(options && options.dryRun);
  const requestId = options && options.requestId != null ? String(options.requestId) : null;
  const catRaw = options && typeof options.cat === 'string' ? options.cat.trim() : '';
  const session = getAuthenticatedSession(req, { requireApiKey: true });

  if (!session.ok) {
    if (dryRun) {
      makeSend({ type: 'wsStatsTestResult', ok: false, requestId, error: session.reason || SAFE_ERRORS.INVALID_SESSION });
    } else {
      makeSend({ type: 'statsInsert', ok: false, inserted: false, error: session.reason || SAFE_ERRORS.INVALID_SESSION, time: Date.now() });
    }
    return;
  }

  try {
    const { TornAPI } = require('torn-client');
    const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
      ? process.env.TORN_API_URL.replace(/\/+$/, '')
      : undefined;
    const tornClient = new TornAPI({
      apiKeys: [session.apiKey],
      ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
    });

    if (dryRun) {
      if (!catRaw) {
        makeSend({ type: 'wsStatsTestResult', ok: false, requestId, error: 'cat is required' });
        return;
      }
      try {
        const apiResponse = await tornClient.user.personalstats({ cat: catRaw });
        let serializable = apiResponse;
        try { serializable = JSON.parse(JSON.stringify(apiResponse)); } catch (_) {}
        makeSend({ type: 'wsStatsTestResult', ok: true, requestId, cat: catRaw, response: serializable });
      } catch (error) {
        logMessage(fastify, 'warn', 'Stats dry-run failed', {
          userId: session.userId,
          category: catRaw,
          error: error && error.message,
        });
        makeSend({ type: 'wsStatsTestResult', ok: false, requestId, cat: catRaw, error: STATS_TEST_FAILED });
      }
      return;
    }

    const getUserDb = require('../utils/getUserDb.cjs');
    const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
    await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log);
    const db = getUserDb(fastify, req);
    const collection = db.collection('Stats');

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const recentDoc = await collection.findOne({ date: { $gte: twelveHoursAgo } });
    if (recentDoc) {
      makeSend({
        type: 'statsInsert',
        ok: true,
        inserted: false,
        reason: 'recentEntryExists',
        lastDate: recentDoc.date,
        message: 'Not inserting Stats (recent entry < 12h)',
        time: Date.now(),
      });
      return;
    }

    const data = await tornClient.user.personalstats({ cat: 'all' });
    const doc = { ...data, date: new Date() };
    await collection.insertOne(doc);
    makeSend({
      type: 'statsInsert',
      ok: true,
      inserted: true,
      date: doc.date,
      message: 'Stats inserted successfully',
      time: Date.now(),
    });
  } catch (error) {
    logMessage(fastify, 'warn', 'Stats refresh failed', {
      userId: session.userId,
      error: error && error.message,
    });
    if (dryRun) {
      makeSend({ type: 'wsStatsTestResult', ok: false, requestId, ...(catRaw ? { cat: catRaw } : {}), error: STATS_TEST_FAILED });
    } else {
      makeSend({ type: 'statsInsert', ok: false, inserted: false, error: STATS_REFRESH_FAILED, time: Date.now() });
    }
  }
};
