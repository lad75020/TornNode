// wsRacingSkill.js
// Gère la récupération des racing skills cumulés
module.exports = async function wsRacingSkill(socket, req, fastify){
  try {
    const getUserDb = require('../utils/getUserDb.cjs');
    let coll;
    try {
  const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
  await ensureUserDbStructure(fastify, req.session.userID, fastify?.log);
  const db = getUserDb(fastify, req);
      coll = db.collection('Stats');
    } catch (e) {
      try { socket.send(JSON.stringify({ type:'racingskill', error: e.message })); } catch(_){}
      return;
    }
    const cursor = coll.find({}, { projection: { date: 1, 'personalstats.racing.skill': 1 } }).sort({ date: 1 });
    const docs = await cursor.toArray();
    const arr = docs
      .filter(doc => doc && doc.date != null && doc.personalstats && typeof doc.personalstats.racing.skill === 'number')
      .map(doc => ({ date: doc.date, racingskill: doc.personalstats.racing.skill }));
    try { socket.send(JSON.stringify({ type: 'racingskill', data: arr })); } catch(_) {}
  } catch (e) {
    if (fastify?.log) fastify.log.error(`[ws] racingskill error: ${e.message}`);
    try { socket.send(JSON.stringify({ type: 'racingskill', error: e.message })); } catch(_) {}
  }
};
