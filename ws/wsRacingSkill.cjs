'use strict';

const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

const RACING_SKILL_RETRIEVAL_FAILED = 'Racing skill could not be loaded. Please retry.';

function normalizeSnapshot(doc) {
  if (!doc || doc.date == null) return null;
  const date = doc.date instanceof Date ? doc.date : new Date(doc.date);
  const skill = doc.personalstats && doc.personalstats.racing && doc.personalstats.racing.skill;
  if (!Number.isFinite(date.getTime()) || typeof skill !== 'number' || !Number.isFinite(skill)) return null;
  return { date: date.toISOString(), racingskill: skill };
}

module.exports = async function wsRacingSkill(socket, req, fastify) {
  const session = getAuthenticatedSession(req);
  if (!session.ok) {
    sendJson(socket, { type: 'racingskill', error: session.reason || SAFE_ERRORS.INVALID_SESSION });
    return;
  }

  let cursor;
  try {
    await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log);
    const db = getUserDb(fastify, req);
    const collection = db.collection('Stats');
    cursor = collection.find({}, {
      projection: { _id: 0, date: 1, 'personalstats.racing.skill': 1 },
    });
    const docs = await cursor.toArray();
    const byDate = new Map();
    for (const doc of docs) {
      const snapshot = normalizeSnapshot(doc);
      if (snapshot) byDate.set(snapshot.date, snapshot);
    }
    const data = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    sendJson(socket, { type: 'racingskill', data });
  } catch (error) {
    logMessage(fastify, 'warn', 'Racing skill retrieval failed', {
      userId: session.userId,
      error: error && error.message,
    });
    sendJson(socket, { type: 'racingskill', error: RACING_SKILL_RETRIEVAL_FAILED });
  } finally {
    try {
      if (cursor && typeof cursor.close === 'function') await cursor.close();
    } catch (_) {
      // Cursor cleanup is best effort; the client already received its result.
    }
  }
};
