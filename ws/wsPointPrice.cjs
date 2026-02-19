module.exports = async function wsPointPrice(socket, req, fastify) {
  const respBase = { type: 'pointPrice' };
  const redisClient = fastify && fastify.redis;
  const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey.cjs');

  const send = (payload) => {
    try { socket.send(JSON.stringify(payload)); } catch (_) {}
  };

  const toFinitePositive = (v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const pushPrice = (arr, value) => {
    const n = toFinitePositive(value);
    if (n !== null) arr.push(n);
  };

  const collectKnownPrices = (node, out) => {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((entry) => collectKnownPrices(entry, out));
      return;
    }

    // Most likely listing fields for points market payloads.
    pushPrice(out, node.cost);
    pushPrice(out, node.price);

    if (node.points && typeof node.points === 'object') {
      collectKnownPrices(node.points, out);
    }
    if (node.listings && typeof node.listings === 'object') {
      collectKnownPrices(node.listings, out);
    }

    Object.values(node).forEach((value) => {
      if (value && typeof value === 'object') collectKnownPrices(value, out);
    });
  };

  const getPlushies10PointsPriceFromRedis = async () => {
    if (!redisClient) return { sum: null, count: 0, pricedCount: 0 };

    let cursor = '0';
    let sum = 0;
    let count = 0;
    let pricedCount = 0;
    // Support both per-item keys (tornItems:vX:<id>) and aggregate keys (tornItems:vX)
    const broadPrefix = ITEMS_KEY_PREFIX.endsWith(':') ? ITEMS_KEY_PREFIX.slice(0, -1) : ITEMS_KEY_PREFIX;
    const pattern = `${broadPrefix}*`;

    const asLower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
    const isPlushieItem = (item) => {
      const type = asLower(item && item.type);
      return type === 'plushie';
    };

    const pickItemPrice = (item) => {
      const value = item && item.value && typeof item.value === 'object' ? item.value : null;
      const candidates = [
        item && item.price,
        item && item.market_price,
        item && item.average_price,
        value && value.market_price,
      ];
      // Prefer positive values; fallback to explicit zero values.
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
      }
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n === 0) return 0;
      }
      return null;
    };

    const collectPlushieItems = (node, out) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((entry) => collectPlushieItems(entry, out));
        return;
      }
      if (isPlushieItem(node)) {
        out.push(node);
        return;
      }
      Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') collectPlushieItems(value, out);
      });
    };

    const getRawByKey = async (key) => {
      // First try RedisJSON storage, fallback to plain string storage.
      try {
        const rawJson = await redisClient.sendCommand(['JSON.GET', key, '$']);
        if (rawJson != null) return rawJson;
      } catch (_) {}
      try {
        return await redisClient.get(key);
      } catch (_) {
        return null;
      }
    };

    const readKeysPayloads = async (keys) => {
      if (!keys.length) return [];
      let canPipeline = false;
      let multi;
      try {
        multi = redisClient.multi();
        canPipeline = !!multi && (typeof multi.addCommand === 'function' || typeof multi.sendCommand === 'function');
      } catch (_) {
        canPipeline = false;
      }

      if (canPipeline) {
        try {
          keys.forEach((k) => {
            const cmd = ['JSON.GET', k, '$'];
            if (typeof multi.addCommand === 'function') multi.addCommand(cmd);
            else multi.sendCommand(cmd);
          });
          const execRes = await multi.exec();
          if (Array.isArray(execRes)) return execRes;
        } catch (_) {
          // fallback to sequential mode below
        }
      }

      const seq = [];
      for (const k of keys) {
        seq.push(await getRawByKey(k));
      }
      return seq;
    };

    const seenIds = new Set();
    do {
      let reply;
      try { reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 400 }); }
      catch { reply = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', '400'); }

      let keys = [];
      if (reply && Array.isArray(reply)) {
        cursor = String(reply[0] || '0');
        keys = Array.isArray(reply[1]) ? reply[1] : [];
      } else if (reply && typeof reply === 'object') {
        cursor = String(reply.cursor || '0');
        keys = Array.isArray(reply.keys) ? reply.keys : [];
      } else {
        cursor = '0';
      }

      if (!keys.length) continue;

      const jsonRes = await readKeysPayloads(keys);

      jsonRes.forEach((rawVal) => {
        let val = rawVal;
        if (Array.isArray(val) && val.length === 2) val = val[1];
        if (val instanceof Error) return;
        if (!val) return;

        try {
          const parsed = JSON.parse(val);
          const plushieItems = [];
          collectPlushieItems(parsed, plushieItems);
          plushieItems.forEach((item) => {
            const id = Number(item && item.id);
            if (Number.isFinite(id)) {
              if (seenIds.has(id)) return;
              seenIds.add(id);
            }

            count += 1;
            const price = pickItemPrice(item);
            if (price === null) return;
            sum += price;
            pricedCount += 1;
          });
        } catch (_) {}
      });
    } while (cursor !== '0');

    return { sum, count, pricedCount };
  };

  try {
    const apiKey = (req && req.session && req.session.TornAPIKey) || process.env.TORN_API_KEY;
    if (!apiKey) {
      send({ ...respBase, ok: false, error: 'Missing Torn API key', time: Date.now() });
      return;
    }

    const { TornAPI } = require('torn-client');
    const tornApiUrl = typeof process.env.TORN_API_URL === 'string'
      ? process.env.TORN_API_URL.replace(/\/+$/, '')
      : undefined;
    const tornClient = new TornAPI({
      apiKeys: [apiKey],
      ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
    });

    // pointsmarket is available through the generic market wrapper.
    const data = await tornClient.market.get({ selections: ['pointsmarket'] });
    const pointsRoot = data && typeof data === 'object' && data.pointsmarket ? data.pointsmarket : data;

    const prices = [];
    collectKnownPrices(pointsRoot, prices);
    const minPrice = prices.length ? Math.min(...prices) : null;

    if (minPrice === null) {
      send({ ...respBase, ok: false, error: 'No point listings found', time: Date.now() });
      return;
    }

    let plushies10PointsPrice = null;
    let plushieItemsCount = 0;
    try {
      const plushieTotals = await getPlushies10PointsPriceFromRedis();
      plushies10PointsPrice = plushieTotals.sum;
      plushieItemsCount = plushieTotals.count;
      const plushiePricedItemsCount = plushieTotals.pricedCount;
      send({
        ...respBase,
        ok: true,
        minPrice,
        pointsMarket10PointsPrice: minPrice * 10,
        plushies10PointsPrice,
        plushieItemsCount,
        plushiePricedItemsCount,
        time: Date.now(),
      });
      return;
    } catch (redisErr) {
      if (fastify?.log) {
        try { fastify.log.warn('[wsPointPrice] redis plushie sum failed: ' + redisErr.message); } catch (_) {}
      }
    }
    send({
      ...respBase,
      ok: true,
      minPrice,
      pointsMarket10PointsPrice: minPrice * 10,
      plushies10PointsPrice,
      plushieItemsCount,
      plushiePricedItemsCount: 0,
      time: Date.now(),
    });
  } catch (e) {
    if (fastify?.log) {
      try { fastify.log.warn('[wsPointPrice] ' + (e && e.message ? e.message : String(e))); } catch (_) {}
    }
    send({
      ...respBase,
      ok: false,
      error: e && e.message ? e.message : String(e),
      time: Date.now(),
    });
  }
};
