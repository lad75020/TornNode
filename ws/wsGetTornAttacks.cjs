// wsGetTornAttacks.js
// Calque la logique de la route HTTP getTornAttacks mais via WebSocket.
module.exports = async function wsGetTornAttacks(socket, req, fastify, payload) {
  try {
    if (!req.session || !req.session.TornAPIKey) {
      return socket.send(JSON.stringify({ type: 'getTornAttacks', error: 'Invalid session' }));
    }
    const { from, to } = payload;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return socket.send(JSON.stringify({ type: 'getTornAttacks', error: 'Missing from/to' }));
    }
  const getUserDb = require('../utils/getUserDb.cjs');
  const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
  await ensureUserDbStructure(fastify, req.session.userID, fastify?.log);
  const database = getUserDb(fastify, req);
    const attacksCollection = database.collection('attacks');
    const aFilter = { started: { $gt: parseInt(from, 10), $lt: parseInt(to, 10) } };
    const options = { projection: { _id: 0, code: 0 } };
    const cursor = attacksCollection.find(aFilter, options);
    let attacks = 0, defends = 0, wins = 0, losses = 0;
    for await (const doc of cursor) {
      if (doc.attacker && doc.attacker.id === req.session.userID) {
        attacks++;
        if (!['Lost'].includes(doc.result)) wins++; else losses++;
      } else if (doc.attacker) {
        defends++;
        if (['Lost'].includes(doc.result)) wins++; else losses++;
      }
    }
    socket.send(JSON.stringify({ type: 'getTornAttacks', from, to, wins, losses, attacks, defends }));
  } catch (e) {
    try { socket.send(JSON.stringify({ type: 'getTornAttacks', error: e.message })); } catch(_) {}
    if (fastify?.log) fastify.log.error('[wsGetTornAttacks] '+e.message);
  }
};
