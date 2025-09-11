// wsGetNetworth.js
// Envoie l'historique de networth via WebSocket
module.exports = async function wsGetNetworth(socket, req, client, fastify) {
  try {
    if (!req.session || !req.session.TornAPIKey) {
      try { socket.send(JSON.stringify({ type: 'getNetworth', error: 'Invalid session'})); } catch(_) {}
      return;
    }
  const getUserDb = require('../utils/getUserDb');
  const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
  await ensureUserDbStructure(client, req.session.userID, fastify?.log);
  const database = getUserDb(client, req);
    const networthCollection = database.collection('Networth');
    const options = { projection: { _id: 0 } };
    const networthDocs = await networthCollection.find({}, options).toArray();
    const data = networthDocs
      .map(doc => {
        const date = doc.date instanceof Date ? doc.date.toISOString() : doc.date;
        let val;
        if (typeof doc.value === 'number') {
          val = doc.value;
        } else if (doc && doc.money && doc.money.daily_networth != null) {
          const tmp = doc.money.daily_networth;
          val = typeof tmp === 'number' ? tmp : Number(tmp);
        }
        return { date, value: val };
      })
      .filter(d => Number.isFinite(d.value));
    try { socket.send(JSON.stringify({ type: 'getNetworth', data })); } catch(_) {}
  } catch(e) {
    fastify.log.error('[wsGetNetworth] ' + e.message);
    try { socket.send(JSON.stringify({ type: 'getNetworth', error: e.message })); } catch(_) {}
  }
};
