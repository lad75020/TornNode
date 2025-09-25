// Agrège l'historique des snapshots CompanyProfile
// Sortie: { type:'getCompanyProfileHistory', ok:true, series:{ metricKey: [{t,v}] }, lastTimestamp, metricsRank }
// metricsRank: classement simple des métriques selon la dernière valeur (utile pour UI future)
module.exports = async function wsGetCompanyProfileHistory(socket, req, fastify, parsed) {
  const respBase = { type: 'getCompanyProfileHistory' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  try {
    const database = fastify.mongo.client.db(req.session.userID.toString());
    const col = database.collection('CompanyProfile');
    // Filtrage optionnel par plage de dates
    const from = parsed && Number(parsed.from);
    const to = parsed && Number(parsed.to);
    const filter = {};
    if (Number.isFinite(from) || Number.isFinite(to)) {
      filter.timestamp = {};
      if (Number.isFinite(from)) filter.timestamp.$gte = from;
      if (Number.isFinite(to)) filter.timestamp.$lte = to;
    }
    // On récupère les snapshots (projection réduite)
    const cursor = col.find(filter, { projection: { _id:0, timestamp:1, company:1 } }).sort({ timestamp:1 });
    const series = {
      daily_income: [],
      weekly_income: [],
      employees_hired: [],
      employees_capacity: [],
      daily_customers: [],
      weekly_customers: []
    };
    let lastTimestamp = null;
    await cursor.forEach(doc => {
      if (!doc || !doc.company || !doc.timestamp) return;
      const p = doc.company;
      lastTimestamp = doc.timestamp;
      push(series.daily_income, doc.timestamp, p.daily_income);
      push(series.weekly_income, doc.timestamp, p.weekly_income);
      push(series.employees_hired, doc.timestamp, p.employees_hired);
      push(series.employees_capacity, doc.timestamp, p.employees_capacity);
      push(series.daily_customers, doc.timestamp, p.daily_customers);
      push(series.weekly_customers, doc.timestamp, p.weekly_customers);
    });
    // Classement simple des métriques par dernière valeur
    const metricsRank = Object.keys(series).map(k => {
      const arr = series[k];
      const last = arr.length ? arr[arr.length - 1].v : 0;
      return { metric: k, lastValue: last };
    }).sort((a,b) => b.lastValue - a.lastValue);
    const meta = { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null };
    try { socket.send(JSON.stringify({ ...respBase, ok:true, series, lastTimestamp, metricsRank, meta })); } catch {}
  } catch(e) {
    fastify.log.warn('[wsGetCompanyProfileHistory] failed: ' + e.message);
    try { socket.send(JSON.stringify({ ...respBase, ok:false, error:e.message })); } catch {}
  }
};

function push(arr, t, raw) {
  const n = Number(raw);
  arr.push({ t, v: Number.isFinite(n) ? n : 0 });
}
