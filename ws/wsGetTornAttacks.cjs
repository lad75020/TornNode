'use strict';

const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const {
  SAFE_ERRORS,
  getAuthenticatedSession,
  parseRange,
  sendJson,
  logMessage,
} = require('../utils/tornSyncHelpers.cjs');

module.exports = async function wsGetTornAttacks(socket, req, fastify, payload = {}) {
  const session = getAuthenticatedSession(req, { requireApiKey: true });
  if (!session.ok) {
    sendJson(socket, { type: 'getTornAttacks', error: SAFE_ERRORS.ATTACK_RETRIEVAL_FAILED });
    return;
  }
  const range = parseRange(payload);
  if (!range.ok) {
    sendJson(socket, { type: 'getTornAttacks', error: SAFE_ERRORS.INVALID_RANGE });
    return;
  }

  try {
    await ensureUserDbStructure(fastify, session.userId, fastify && fastify.log);
    const database = getUserDb(fastify, req);
    const attacksCollection = database.collection('attacks');
    const filter = { started: { $gte: range.from, $lte: range.to } };
    const cursor = attacksCollection.find(filter, { projection: { _id: 0, code: 0 } });
    let attacks = 0;
    let defends = 0;
    let wins = 0;
    let losses = 0;
    try {
      for await (const doc of cursor) {
        const attackerId = doc && doc.attacker && Number(doc.attacker.id);
        const isAttack = Number.isSafeInteger(attackerId) && attackerId === session.userId;
        if (isAttack) attacks += 1;
        else if (doc && doc.attacker) defends += 1;
        const lost = doc && doc.result === 'Lost';
        if ((isAttack && !lost) || (!isAttack && lost)) wins += 1;
        else losses += 1;
      }
    } finally {
      try { if (cursor && typeof cursor.close === 'function') await cursor.close(); } catch (_) {}
    }
    sendJson(socket, { type: 'getTornAttacks', from: range.from, to: range.to, wins, losses, attacks, defends });
  } catch (error) {
    logMessage(fastify, 'warn', 'Torn attack retrieval failed', { userId: session.userId, error: error.message });
    sendJson(socket, { type: 'getTornAttacks', error: SAFE_ERRORS.ATTACK_RETRIEVAL_FAILED });
  }
};
