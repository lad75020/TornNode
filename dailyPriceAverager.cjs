// Aggregates daily average price per item from Redis variation logs into MongoDB Items collection.
// Always and ONLY processes the previous UTC day so current day in-flight data stays intact.
// If invoked multiple times (manual trigger) it is idempotent per day thanks to $addToSet.
module.exports = async function dailyPriceAverager({ redisClient, fastify, manual = false }) {
  redisClient = redisClient || (fastify && fastify.redis);
  const log = fastify?.log || console;
  const startTs = Date.now();
  const runId = `${startTs}-${Math.random().toString(36).slice(2,8)}`;
  const db = (typeof fastify.mongo.db === 'function' ? fastify.mongo.db('TORN') : fastify.mongo.client.db('TORN'));
  const itemsCollection = db.collection('Items');
  log.info({ runId, manual }, '[dailyPriceAverager] start');
  // Determine yesterday's UTC date (we run just after midnight)
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const yesterday = new Date(Date.UTC(utcYear, utcMonth, utcDate - 1));
  const y = yesterday.getUTCFullYear();
  const m = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getUTCDate()).padStart(2, '0');
  const dayKey = `${y}${m}${d}`; // YYYYMMDD
  log.info({ runId, dayKey }, '[dailyPriceAverager] target previous day');

  const scanPattern = `pricevars:${dayKey}:*`;
  let cursor = 0;
  const itemAverages = new Map();
  let scanIterations = 0;
  let totalKeysMatched = 0;
  let totalListsFetched = 0;
  let totalEntriesParsed = 0;
  let totalEntriesValid = 0;
  try {
    // Helper to perform a scan iteration compatible with both reply formats (array or object)
    const doScan = async (c) => {
      let r;
      try {
        // node-redis v4 prefers options object; ensure cursor is string.
        r = await redisClient.scan(String(c), { MATCH: scanPattern, COUNT: 500 });
      } catch (e) {
        // Fallback to legacy signature if needed
        try {
          r = await redisClient.scan(String(c), 'MATCH', scanPattern, 'COUNT', '500');
        } catch (e2) {
          throw e2;
        }
      }
      if (Array.isArray(r)) {
        return { cursor: Number(r[0]), keys: r[1] };
      }
      if (r && typeof r === 'object' && Array.isArray(r.keys)) {
        return { cursor: Number(r.cursor), keys: r.keys };
      }
      throw new Error('Unexpected SCAN reply shape');
    };
    do {
      const reply = await doScan(cursor);
      cursor = reply.cursor;
      const keys = reply.keys;
      scanIterations++;
      totalKeysMatched += keys.length;
      if (scanIterations <= 10) { // limiter bruit
        log.info({ runId, iteration: scanIterations, cursor, keys: keys.length, sample: keys[0] }, '[dailyPriceAverager] scan batch');
      }
      if (keys.length) {
        // Pipeline for efficiency
        const pipeline = redisClient.multi();
        for (const k of keys) pipeline.lRange(k, 0, -1);
        let lists;
        try {
          lists = await pipeline.exec();
        } catch (e) {
          log.error({ runId, err: e.message }, '[dailyPriceAverager] pipeline exec failure');
          continue;
        }
        totalListsFetched += lists.length;
        lists.forEach((res, idx) => {
          const key = keys[idx];
          const parts = key.split(':');
          const itemId = Number(parts[2]);
          if (!Number.isFinite(itemId)) {
            log.warn({ runId, key }, '[dailyPriceAverager] invalid itemId in key');
            return;
          }
          // Compat: ioredis returns [err, value]; node-redis v4 returns value directly.
          let rawList = res;
          if (Array.isArray(res) && res.length === 2 && (Array.isArray(res[1]) || res[1] === null)) {
            rawList = res[1];
          }
            if (!Array.isArray(rawList)) {
              log.debug({ runId, key, shape: Array.isArray(res) ? res.length : typeof res }, '[dailyPriceAverager] non-array rawList');
              return; // aucune donnée
            }
          let sum = 0; let count = 0; let localParsed = 0; let localValid = 0;
          for (const entry of rawList) {
            localParsed++;
            try {
              const obj = JSON.parse(entry);
              if (obj && typeof obj.p === 'number') { sum += obj.p; count++; localValid++; }
            } catch (e) {
              // ignore parse error but could sample log
              if (localParsed < 3) log.debug({ runId, key, err: e.message }, '[dailyPriceAverager] JSON parse error entry');
            }
          }
          totalEntriesParsed += localParsed;
          totalEntriesValid += localValid;
          if (count > 0) {
            const avg = Math.round(sum / count);
            itemAverages.set(itemId, avg);
          }
        });
      }
    } while (cursor !== 0);
  } catch (e) {
    log.error({ runId, err: e.message, stack: e.stack }, '[dailyPriceAverager] scan loop error');
    return;
  }
  if (!itemAverages.size) {
    log.warn({ runId, dayKey, scanIterations, totalKeysMatched, totalListsFetched, totalEntriesParsed, totalEntriesValid }, '[dailyPriceAverager] no averages computed');
    return;
  }
  log.info({ runId, dayKey, items: itemAverages.size, scanIterations, totalKeysMatched, totalListsFetched, totalEntriesParsed, totalEntriesValid }, '[dailyPriceAverager] computing averages');
  // Idempotent insert: use $addToSet so a manual re-run won't duplicate the same date entry.
  try {
    const bulk = itemsCollection.initializeUnorderedBulkOp();
    for (const [itemId, avg] of itemAverages.entries()) {
      bulk.find({ id: itemId }).updateOne({
        $addToSet: { dailyPriceAverages: { date: dayKey, avg } }
      });
    }
    // Some drivers expose length differently; rely on itemAverages.size instead for summary.
    const result = await bulk.execute();
    log.info({ runId, modified: result.nModified || result.modifiedCount, upserts: result.nUpserted || result.upsertedCount }, '[dailyPriceAverager] bulk execute done');
  } catch (e) {
    log.error({ runId, err: e.message, stack: e.stack }, '[dailyPriceAverager] bulk execute error');
  }
  // Cleanup processed keys (optional)
  try {
    if (itemAverages.size) {
      let c2 = 0; const delKeys = [];
      const doScan2 = async (c) => {
        let r;
        try { r = await redisClient.scan(String(c), { MATCH: scanPattern, COUNT: 500 }); }
        catch (e) { r = await redisClient.scan(String(c), 'MATCH', scanPattern, 'COUNT', '500'); }
        if (Array.isArray(r)) return { cursor: Number(r[0]), keys: r[1] };
        if (r && typeof r === 'object' && Array.isArray(r.keys)) return { cursor: Number(r.cursor), keys: r.keys };
        throw new Error('Unexpected SCAN reply shape (cleanup)');
      };
      do {
        const reply = await doScan2(c2);
        c2 = reply.cursor;
        delKeys.push(...reply.keys);
      } while (c2 !== 0);
      if (delKeys.length) {
        log.info({ runId, del: delKeys.length }, '[dailyPriceAverager] cleanup deleting keys');
        const pipeline = redisClient.multi();
        delKeys.forEach(k => pipeline.del(k));
        try { await pipeline.exec(); } catch (e) { log.error({ runId, err: e.message }, '[dailyPriceAverager] cleanup pipeline error'); }
        log.info({ runId, del: delKeys.length }, '[dailyPriceAverager] cleanup done');
      } else {
        log.info({ runId }, '[dailyPriceAverager] cleanup nothing to delete');
      }
    }
  } catch (e) {
    log.error({ runId, err: e.message, stack: e.stack }, '[dailyPriceAverager] cleanup error');
  }
  const durationMs = Date.now() - startTs;
  log.info({ runId, dayKey, durationMs }, '[dailyPriceAverager] finished');
};
