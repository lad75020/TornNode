const fetchOrReuseSnapshot = require('../utils/fetchOrReuseSnapshot.cjs');

module.exports = async function wsCompanyStock(socket, req, fastify) {
  const respBase = { type: 'companyStock' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  const apiKey = req.session.TornAPIKey;
  const url = `https://api.torn.com/company/111803?key=${apiKey}&comment=ReactTorn&selections=stock`;
  const result = await fetchOrReuseSnapshot(fastify, {
    collection: 'CompanyStock',
    url,
    extract: j => j.company_stock,
    fieldName: 'stocks',
    reuseWindowMs: 12*3600*1000,
    databaseName: req.session.userID.toString()
  });
  if (result.error) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error: result.error })); } catch {}
    return;
  }
  const payload = { ...respBase, ok:true, stock: result.data, timestamp: result.timestamp, reused: !!result.reused, inserted: !!result.inserted };
  if (result.stale) payload.stale = true;
  try { socket.send(JSON.stringify(payload)); } catch {}
};
