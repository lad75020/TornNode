module.exports = async function wsGetCompanyProfile(socket, req, fastify) {
  const respBase = { type: 'getCompanyProfile' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  try {
    const database = fastify.mongo.client.db(req.session.userID.toString());
    const col = database.collection('CompanyProfile');
    const doc = await col.find({}, { projection: { _id:0 } }).sort({ timestamp:-1 }).limit(1).next();
    if (!doc || !doc.company) {
      try { socket.send(JSON.stringify({ ...respBase, ok:true, profile:null, timestamp:null, empty:true })); } catch {}
      return;
    }
    try { socket.send(JSON.stringify({ ...respBase, ok:true, profile: doc.company, timestamp: doc.timestamp })); } catch {}
  } catch(e) {
    fastify.log.warn('[wsGetCompanyProfile] failed: ' + e.message);
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:e.message })); } catch {}
  }
};
