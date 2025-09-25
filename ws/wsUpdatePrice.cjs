module.exports = async function wsUpdatePrice(socket, req, fastify, parsed, redisClient, opts = {}) {
  const { isTest = false } = opts;
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ type:'updatePrice', ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  const { id, price: suppliedPrice } = parsed || {};
  const idInt = parseInt(id);
  if (!Number.isFinite(idInt)) {
    try { socket.send(JSON.stringify({ type:'updatePrice', ok:false, error:'invalid id' })); } catch {}
    return;
  }
  try {
  // Items restent globaux (database partagée 'TORN')
  const database = (typeof fastify.mongo.db === 'function' ? fastify.mongo.db('TORN') : fastify.mongo.client.db('TORN'));
    const itemsCollection = database.collection('Items');
    let price;
    if (typeof suppliedPrice === 'number' && suppliedPrice >= 0) {
      price = Math.floor(suppliedPrice);
    } else {
      const apiResp = await fetch(`${process.env.TORN_API_URL}market/${idInt}/itemmarket?key=${req.session.TornAPIKey}&offset=0`);
      const data = await apiResp.json();
      price = data?.itemmarket?.listings?.[0]?.price;
    }
    if (typeof price === 'number') {
      await itemsCollection.updateOne({ id: idInt }, { $set: { price } }, { upsert: false });
    }
    const item = await itemsCollection.findOne({ id: idInt }) || { id: idInt, price };

    const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey.cjs');
    const itemKey = `${ITEMS_KEY_PREFIX}${idInt}`;
    let cacheUpdated = false;
    try {
      if (item) {
        await redisClient.sendCommand(['JSON.SET', itemKey, '$', JSON.stringify(item)]);
        cacheUpdated = true;
      } else if (typeof price === 'number') {
        await redisClient.sendCommand(['JSON.SET', itemKey, '$.price', JSON.stringify(price)]);
        cacheUpdated = true;
      }
    } catch (e) {
      fastify.log.warn(`[wsUpdatePrice] JSON.SET fail key=${itemKey} err=${e.message}`);
    }
    if (cacheUpdated) { try { await redisClient.expire(itemKey, 86400); } catch {} }
    try { socket.send(JSON.stringify({ type:'updatePrice', ok:true, id:item.id, price: typeof price==='number'?price:null, cache: cacheUpdated?'json':'miss-json' })); } catch {}
    // Log raw price variation for daily averaging (store ALL variations for the day)
    try {
      if (typeof price === 'number' && redisClient ) {
  // MAJ du cache partagé lastMinPrices pour éviter double log juste après via wsBazaarPrice
  try { const { lastMinPrices } = require('./priceState.cjs'); lastMinPrices.set(idInt, price); } catch(_){ }
        const now = new Date();
        // Use UTC date for consistency
        const y = now.getUTCFullYear();
        const m = String(now.getUTCMonth()+1).padStart(2,'0');
        const d = String(now.getUTCDate()).padStart(2,'0');
        const dayKey = `${y}${m}${d}`; // YYYYMMDD
        const listKey = `pricevars:${dayKey}:${idInt}`;
        // Push JSON with timestamp and price so we could do other stats later if needed
        await redisClient.rPush(listKey, JSON.stringify({ t: now.toISOString(), p: price }));
        // Ensure key expires after 3 days to avoid buildup if cleanup fails
        // Set expire only if not already set (> 0 TTL)
        try {
          const ttl = await redisClient.ttl(listKey);
          if (ttl === -1) { // no expire
            await redisClient.expire(listKey, 60 * 60 * 24 * 3);
          }
        } catch {}
      }
  } catch(e) { fastify?.log && fastify.log.debug && fastify.log.debug(`[wsUpdatePrice] variation log fail ${e.message}`); }
  } catch (e) {
    try { socket.send(JSON.stringify({ type:'updatePrice', ok:false, error:e.message })); } catch {}
  }
};
