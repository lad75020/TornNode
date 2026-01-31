module.exports = async function wsGetCompanyStock(socket, req, fastify, parsed) {
  const respBase = { type: 'getCompanyStock' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  try {
    const database = (typeof fastify.mongo.db === 'function' ? fastify.mongo.db(req.session.userID.toString()) : fastify.mongo.client.db(req.session.userID.toString()));
    const col = database.collection('CompanyStock');
    // Dernier snapshot (tri par timestamp desc)
    const doc = await col.find({}, { projection: { _id:0 } }).sort({ timestamp:-1 }).limit(1).next();
    if (!doc) {
      try { socket.send(JSON.stringify({ ...respBase, ok:true, stock:[], empty:true })); } catch {}
      return;
    }
    try { socket.send(JSON.stringify({ ...respBase, ok:true, stock: doc.stock || [], timestamp: doc.timestamp })); } catch {}
  } catch(e) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:e.message })); } catch {}
  }
};
