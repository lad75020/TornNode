// wsCompanyTrainRange.js
// Agrège les working stats par jour sur la plage demandée
module.exports = async function wsCompanyTrainRange(socket, req, client, fastify, payload){
  const { from, to } = payload || {};
  if (typeof from !== 'number' || typeof to !== 'number' || !(from < to)) {
    try { socket.send(JSON.stringify({ type:'companyTrainRange', error: 'Invalid from/to' })); } catch(_) {}
    return;
  }
  try {
    const database = client.db(req.session.userID.toString());
    const logsCollection = database.collection('logs');
    const statsCollection = database.collection('Stats');
    const normDay = (val) => {
      try {
        if (typeof val === 'number') return new Date(val * 1000).toISOString().slice(0,10);
        if (val instanceof Date) return val.toISOString().slice(0,10);
        if (typeof val === 'string') return val.slice(0,10);
      } catch(_) {}
      return null;
    };
    const toInt = (v) => {
      if (v == null) return 0;
      if (typeof v === 'number') return v|0;
      const n = Number(String(v).replace(/[,\s]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const filter = {
      timestamp: { $gt: parseInt(from), $lt: parseInt(to) },
      log: { $in: [6264, 6220, 6221, 5963] }
    };
    const options = { sort: { timestamp: 1 }, projection: { timestamp: 1, 'data.working_stats_received': 1, log: 1 } };
    const cursor = logsCollection.find(filter, options);
    const dayMap = new Map();
    for await (const doc of cursor) {
      const ts = doc.timestamp;
      if (!ts) continue;
      const d = new Date(ts * 1000);
      const dayLabel = d.toISOString().slice(0,10); // YYYY-MM-DD
      if (!dayMap.has(dayLabel)) dayMap.set(dayLabel, { date: dayLabel, manual: 0, intelligence: 0, endurance: 0, trains: 0 });
      const agg = dayMap.get(dayLabel);
      if (doc.log === 6264) agg.trains++;
      try {
        const parts = (doc.data?.working_stats_received || '').split(',');
        if (parts[0]) agg.manual += parseInt(parts[0], 10) || 0;
        if (parts[1]) agg.intelligence += parseInt(parts[1], 10) || 0;
        if (parts[2]) agg.endurance += parseInt(parts[2], 10) || 0;
      } catch(_) {}
    }
    // Overlay des valeurs issues de Stats quand disponibles (plus précises)
    try {
      const fromDay = normDay(from);
      const toDay = normDay(to);
      const sCursor = statsCollection.find(
        {},
        { projection: { date: 1, 'personalstats.jobs.stats.manual':1, 'personalstats.jobs.stats.intelligence':1, 'personalstats.jobs.stats.endurance':1 } }
      );
      for await (const sdoc of sCursor) {
        const dStr = normDay(sdoc.date);
        if (!dStr) continue;
        if (fromDay && dStr < fromDay) continue;
        if (toDay && dStr > toDay) continue;
        const m = toInt(sdoc?.personalstats?.jobs?.stats?.manual);
        const i = toInt(sdoc?.personalstats?.jobs?.stats?.intelligence);
        const e = toInt(sdoc?.personalstats?.jobs?.stats?.endurance);
  if (!dayMap.has(dStr)) dayMap.set(dStr, { date: dStr, manual: 0, intelligence: 0, endurance: 0, trains: 0, abs: true });
  const agg = dayMap.get(dStr);
  agg.manual = m;
  agg.intelligence = i;
  agg.endurance = e;
  agg.abs = true; // indiquer au front que ces valeurs sont absolues
      }
    } catch(e) {
      try { fastify && fastify.log && fastify.log.warn(`[ws] companyTrainRange Stats overlay error: ${e.message}`); } catch(_) {}
    }
  const dataArr = Array.from(dayMap.values()).sort((a,b)=> (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    try { socket.send(JSON.stringify({ type: 'companyTrainRange', from, to, data: dataArr })); } catch(_) {}
  } catch(err) {
    if (fastify && fastify.log) fastify.log.error(`[ws] companyTrainRange error: ${err.message}`);
    try { socket.send(JSON.stringify({ type:'companyTrainRange', error: err.message })); } catch(_) {}
  }
};
