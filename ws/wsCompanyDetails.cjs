const fetchOrReuseSnapshot = require('../utils/fetchOrReuseSnapshot.cjs');

module.exports = async function wsCompanyDetails(socket, req, fastify, parsed) {
  const respBase = { type: 'companyDetails' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  const apiKey = req.session.TornAPIKey;
  const url = `https://api.torn.com/company/111803?key=${apiKey}&comment=ReactTorn&selections=detailed`;
  // Allow debug/force via parsed
  const forceFetch = parsed && (parsed.force === true || parsed.forceFetch === true);
  const reuseMinutes = parsed && Number.isFinite(parsed.reuseMinutes) && parsed.reuseMinutes >= 0 ? parsed.reuseMinutes : null;
  const reuseWindowMs = forceFetch ? 0 : (reuseMinutes != null ? reuseMinutes*60*1000 : 12*3600*1000);
  const result = await fetchOrReuseSnapshot(fastify, {
    collection: 'CompanyDetails',
    url,
    extract: j => j.company_detailed,
    fieldName: 'details',
    reuseWindowMs,
    databaseName: req.session.userID.toString()
  });
  if (result.error) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error: result.error })); } catch {}
    return;
  }
  const payload = { ...respBase, ok:true, details: result.data, timestamp: result.timestamp, reused: !!result.reused, inserted: !!result.inserted };
  if (result.stale) payload.stale = true;
  // Optional debug info: count documents + known keys
  if (parsed && parsed.debug) {
    try {
      const db = fastify.mongo.client.db('TORN');
      const col = db.collection('CompanyDetails');
      const count = await col.countDocuments();
      const keys = result && result.data && typeof result.data === 'object' ? Object.keys(result.data) : [];
      payload.debug = { count, keys };
    } catch(e) {
      payload.debug = { error: e.message };
    }
  }
  try { socket.send(JSON.stringify(payload)); } catch {}
};
