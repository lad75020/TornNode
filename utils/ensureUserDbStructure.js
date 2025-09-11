// ensureUserDbStructure.js
// Crée les collections nécessaires pour une base utilisateur si absentes.
// Collections multi-tenant: logs, attacks, Networth, Stats
// Idempotent grâce à un cache en mémoire.

const processed = new Set();

module.exports = async function ensureUserDbStructure(mongoClient, userID, logger) {
  if (!mongoClient || !userID) return;
  if (processed.has(userID)) return; // déjà fait dans ce process
  const dbName = String(userID).trim();
  if (!dbName) return;
  try {
    const db = mongoClient.db(dbName);
    const required = ['logs', 'attacks', 'Networth', 'Stats'];
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingNames = new Set(existing.map(c => c.name));
    for (const name of required) {
      if (!existingNames.has(name)) {
        try { await db.createCollection(name); } catch(e) { /* ignore si concurrence */ }
      }
    }
    // Indexes utiles (création idempotente)
    try { await db.collection('logs').createIndex({ timestamp: -1 }); } catch(_){}
    try { await db.collection('logs').createIndex({ log: -1 }); } catch(_){}
    try { await db.collection('attacks').createIndex({ ended: -1 }); } catch(_){}
    try { await db.collection('Networth').createIndex({ date: -1 }); } catch(_){}
    try { await db.collection('Stats').createIndex({ date: -1 }); } catch(_){}
    processed.add(userID);
    //if (logger?.info) logger.info(`[ensureUserDbStructure] ensured for user ${userID}`);
  } catch(e) {
    if (logger?.warn) logger.warn(`[ensureUserDbStructure] fail user=${userID} ${e.message}`);
  }
};
