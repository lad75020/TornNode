// Agrège l'historique des snapshots CompanyDetails
// Entrée: { type:'getCompanyDetailsHistory', from?:<ms|s>, to?:<ms|s> }
// Sortie: { type:'getCompanyDetailsHistory', ok:true, series:{ metricKey: [{t,v}] }, lastTimestamp, meta }

module.exports = async function wsGetCompanyDetailsHistory(socket, req, fastify, parsed = {}) {
  const respBase = { type: 'getCompanyDetailsHistory' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  try {
    const now = Date.now();
    let from = typeof parsed.from === 'number' ? parsed.from : (now - 7*24*3600*1000);
    let to = typeof parsed.to === 'number' ? parsed.to : now;
    if (from < 10_000_000_000) from *= 1000; // seconds -> ms
    if (to < 10_000_000_000) to *= 1000;
    if (from > to) [from, to] = [to, from];

    const db = fastify.mongo.client.db(req.session.userID.toString());
    const col = db.collection('CompanyDetails');
    const docs = await col.find({ timestamp: { $gte: from, $lte: to } }, { projection: { _id:0, timestamp:1, details:1 } })
      .sort({ timestamp:1 }).toArray();

    const series = {
      // Exemples de métriques clés possibles selon la payload detailed
      // Ajustez si la structure réelle diffère
      employees: [],
      capacity: [],
      popularity: [],
      environment: [],
      efficiency: [],
      customers: [],
      daily_income: [],
      weekly_income: []
    };
    let lastTimestamp = null;

    for (const doc of docs) {
      if (!doc || !doc.details || !doc.timestamp) continue;
      const d = doc.details;
      const t = doc.timestamp; lastTimestamp = t;
      // Extraction robuste avec Number() + fallback
      push(series.popularity, t, d.popularity);
      push(series.environment, t, d.environment);
      push(series.efficiency, t, d.efficiency);
    }

    // Nettoyage: retirer séries vides
    Object.keys(series).forEach(k => { if (!series[k].length) delete series[k]; });

    const meta = { from, to, points: docs.length };
    try { socket.send(JSON.stringify({ ...respBase, ok:true, series, lastTimestamp, meta })); } catch {}
  } catch (e) {
    fastify.log.warn('[wsGetCompanyDetailsHistory] failed: ' + e.message);
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:e.message })); } catch {}
  }
};

function push(arr, t, raw) {
  const n = Number(raw);
  arr.push({ t, v: Number.isFinite(n) ? n : 0 });
}
