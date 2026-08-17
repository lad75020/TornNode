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
const { TornAPI } = require('torn-client');

function hasCompanySelection(url, expectedSelection) {
  try {
    const parsed = new URL(url);
    const selections = String(parsed.searchParams.get('selections') || '').toLowerCase();
    return parsed.pathname.startsWith('/company/') && selections.split(',').includes(String(expectedSelection).toLowerCase());
  } catch (_) {
    return false;
  }
}

function isCompanyDetailsUrl(url) {
  return hasCompanySelection(url, 'detailed');
}

function isCompanyProfileUrl(url) {
  return hasCompanySelection(url, 'profile');
}

function isCompanyStockUrl(url) {
  return hasCompanySelection(url, 'stock');
}

async function fetchCompanySnapshotWithTornClient(url) {
  const parsed = new URL(url);
  const apiKey = parsed.searchParams.get('key');
  if (!apiKey) throw new Error('missing_api_key_in_url');

  const params = {};
  for (const [k, v] of parsed.searchParams.entries()) {
    if (k === 'key' || k === 'comment') continue;
    params[k] = v;
  }

  const baseApiUrl = `${parsed.protocol}//${parsed.host}`;
  const comment = parsed.searchParams.get('comment');
  const tornClient = new TornAPI({
    apiKeys: [apiKey],
    apiUrl: baseApiUrl,
    ...(comment ? { comment } : {})
  });

  return tornClient.requestHandler.makeRequest(parsed.pathname, params);
}

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
      try { fastify.log.info({ collection, fieldName, reuseWindowMs }, '[fetchOrReuseSnapshot] start'); } catch {}
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
      if (isCompanyDetailsUrl(url) || isCompanyProfileUrl(url) || isCompanyStockUrl(url)) {
        json = await fetchCompanySnapshotWithTornClient(url);
        if (debug) { try { fastify.log.info('[fetchOrReuseSnapshot] company snapshot via torn-client'); } catch {} }
      } else {
        const res = await fetch(url, { method:'GET', redirect:'follow' });
        if (debug) { try { fastify.log.info({ status: res.status }, '[fetchOrReuseSnapshot] fetch status'); } catch {} }
        if (!res.ok) {
          let text = '';
          try { text = await res.text(); } catch {}
          const msg = `HTTP ${res.status}${text ? ' body:'+text.slice(0,180) : ''}`;
          throw new Error(msg);
        }
        json = await res.json();
      }
      if (debug) {
        try {
          const keys = json && typeof json === 'object' ? Object.keys(json) : [];
          fastify.log.info({ keys }, '[fetchOrReuseSnapshot] fetch ok json keys');
        } catch {}
      }
    } catch(fetchErr) {
      // fallback dernier doc (stale)
      if (debug) { try { fastify.log.warn({ collection }, '[fetchOrReuseSnapshot] fetch unavailable; trying fallback'); } catch {} }
      const fallback = await col.find({}, { projection: { _id:0 } }).sort({ timestamp:-1 }).limit(1).next();
      if (fallback && fallback[fieldName]) {
        if (debug) { try { fastify.log.info({ ts: fallback.timestamp }, '[fetchOrReuseSnapshot] returning stale fallback'); } catch {} }
        return { reused:true, inserted:false, stale:true, timestamp: fallback.timestamp, data: fallback[fieldName] };
      }
      return { error: 'fetch_failed' };
    }
    let data;
    try { data = extract(json); } catch(e) {
      if (debug) { try { fastify.log.warn({ collection }, '[fetchOrReuseSnapshot] extract unavailable'); } catch {} }
      return { error:'extract_failed' };
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
      try { fastify.log.warn({ collection }, '[fetchOrReuseSnapshot] insert unavailable'); } catch {}
    }
    return { reused:false, inserted, stale:false, timestamp: ts, data };
  } catch(e) {
    if (process.env.SNAPSHOT_DEBUG) { try { fastify.log.error({ collection }, '[fetchOrReuseSnapshot] unavailable'); } catch {} }
    return { error: 'internal_error' };
  }
};
