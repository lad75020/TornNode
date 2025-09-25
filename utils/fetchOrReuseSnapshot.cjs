// Util générique pour handlers snapshot Torn Company (stock/profile ou futurs)
// Paramètres:
//  - fastify: instance
//  - socket: websocket (pour envoi direct si desired ? ici on retourne juste objet)
//  - options: {
//       collection: 'CompanyStock' | 'CompanyProfile' | ...,
//       url: URL API Torn à fetch,
//       extract: (json) => objetData (ex: j.company_stock),
//       fieldName: 'stocks' | 'profile', // clé sous laquelle enregistrer le snapshot en base
//       reuseWindowMs: durée fenêtre (default 12h),
//       projectionExtra?: projection additionnelle,
//       rawDoc?: bool (si besoin retourner doc complet)
//    }
// Retourne: { reused, inserted, stale, timestamp, data, error? }

module.exports = async function fetchOrReuseSnapshot(fastify, options) {
  const {
    collection,
    url,
    extract,
    fieldName,
    reuseWindowMs = 12*3600*1000,
    databaseName
  } = options || {};
  const ts = Date.now();
  const windowStart = ts - reuseWindowMs;
  if (!collection || !url || !extract || !fieldName) {
    return { error:'missing_params' };
  }
  try {
    const database = fastify.mongo.client.db(databaseName);
    const col = database.collection(collection);
    const debug = false;
    if (debug) {
      try { fastify.log.info({ collection, url, fieldName, reuseWindowMs }, '[fetchOrReuseSnapshot] start'); } catch {}
    }

    const existing = await col.findOne({ timestamp: { $gte: windowStart } }, { projection: { _id:0 } });
    if (existing && existing[fieldName]) {
      if (debug) {
        try { fastify.log.info({ collection, ts: existing.timestamp }, '[fetchOrReuseSnapshot] reuse existing snapshot'); } catch {}
      }
      return { reused:true, inserted:false, stale:false, timestamp: existing.timestamp, data: existing[fieldName] };
    }
    // Fetch API
    let json;
    try {
      const res = await fetch(url, { method:'GET', redirect:'follow' });
      if (debug) { try { fastify.log.info({ status: res.status }, '[fetchOrReuseSnapshot] fetch status'); } catch {} }
      if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch {}
        const msg = `HTTP ${res.status}${text ? ' body:'+text.slice(0,180) : ''}`;
        throw new Error(msg);
      }
      json = await res.json();
      if (debug) {
        try {
          const keys = json && typeof json === 'object' ? Object.keys(json) : [];
          fastify.log.info({ keys }, '[fetchOrReuseSnapshot] fetch ok json keys');
        } catch {}
      }
    } catch(fetchErr) {
      // fallback dernier doc (stale)
      if (debug) { try { fastify.log.warn({ err: String(fetchErr) }, '[fetchOrReuseSnapshot] fetch failed; trying fallback'); } catch {} }
      const fallback = await col.find({}, { projection: { _id:0 } }).sort({ timestamp:-1 }).limit(1).next();
      if (fallback && fallback[fieldName]) {
        if (debug) { try { fastify.log.info({ ts: fallback.timestamp }, '[fetchOrReuseSnapshot] returning stale fallback'); } catch {} }
        return { reused:true, inserted:false, stale:true, timestamp: fallback.timestamp, data: fallback[fieldName] };
      }
      return { error: fetchErr.message || 'fetch_failed' };
    }
    let data;
    try { data = extract(json); } catch(e) {
      if (debug) { try { fastify.log.warn({ err: e.message }, '[fetchOrReuseSnapshot] extract failed'); } catch {} }
      return { error:'extract_failed:'+e.message };
    }
    if (!data || typeof data !== 'object') {
      if (debug) { try { fastify.log.warn({ typeofData: typeof data }, '[fetchOrReuseSnapshot] invalid_data after extract'); } catch {} }
      return { error:'invalid_data' };
    }
    let inserted = false;
    try {
      await col.insertOne({ timestamp: ts, [fieldName]: data });
      inserted = true;
      if (debug) { try { fastify.log.info({ collection, ts }, '[fetchOrReuseSnapshot] inserted snapshot'); } catch {} }
    } catch(dbErr) {
      fastify.log.warn(`[fetchOrReuseSnapshot] insert warn ${collection}: ${dbErr.message}`);
    }
    return { reused:false, inserted, stale:false, timestamp: ts, data };
  } catch(e) {
    if (process.env.SNAPSHOT_DEBUG) { try { fastify.log.error({ err: e.message }, '[fetchOrReuseSnapshot] fatal'); } catch {} }
    return { error: e.message || 'internal_error' };
  }
};
