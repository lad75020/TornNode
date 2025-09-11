'use strict';
require('dotenv').config();

const fastifyPlugin = require('fastify-plugin');
const API_BASE = process.env.TORN_API_URL;
const REFRESH_MS = Number(process.env.REFRESH_MS || 30000);
const SAFE_RPM = Math.min(Number(process.env.SAFE_RPM || 55), 59);
const API_KEY = process.env.TORN_API_KEY;
if (!API_KEY) throw new Error('Missing TORN_API_KEY in .env');

const dynamicWatchSet = new Set();


const MIN_INTERVAL_MS = Math.ceil(60_000 / SAFE_RPM);
const queue = [];
let isProcessing = false;
let itemNameMap = new Map();
// Suivi du dernier prix min connu partagé avec wsUpdatePrice
const { lastMinPrices } = require('./priceState');
// Suivi du dernier prix déjà diffusé au front (null accepté pour absence de listings)
const lastBroadcastedMin = new Map();

// IMPORTANT: plus de fastify ici
let redis;                 // sera affecté dans le plugin

function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const { task, resolve, reject } = queue.shift();
  Promise.resolve()
    .then(task)
    .then(resolve)
    .catch(reject)
    .finally(() => {
      setTimeout(() => {
        isProcessing = false;
        processQueue();
      }, MIN_INTERVAL_MS);
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function getBazaarListings(fastify, itemId) {
  const url = `${API_BASE}/market/${itemId}?selections=itemmarket&key=${API_KEY}`;
  const data = await getJson(url);
  if (data.error) throw new Error(`Market error: [${data.error.code}] ${data.error.error}`);
  const listings = (data.itemmarket && data.itemmarket.listings) || [];
  const mapped = listings.map(l => ({
    price: Number(l.price),
    quantity: Number(l.amount)
  })).filter(l => Number.isFinite(l.price) && l.price > 0);
  if (!mapped.length) {
    fastify.log.warn(`[wsBazaarPrice] No listings for item ${itemId}`);
  }
  return mapped;
}

async function fetchListingsAndMin(fastify, itemId) {
  let attempt = 0, delay = 1500;
  while (attempt < 4) {
    try {
  const listings = await enqueue(() => getBazaarListings(fastify, itemId));
      if (!listings.length) return { minPrice: null, listings: [] };
      const minPrice = listings.reduce((m, l) => l.price < m ? l.price : m, Infinity);
      return { minPrice: isFinite(minPrice) ? minPrice : null, listings };
    } catch (e) {
      attempt++;
      if (attempt < 4) {
        await sleep(delay);
        delay *= 2;
      } else {
        fastify.log.error(`[wsBazaarPrice] fetch failed item=${itemId} ${e.message}`);
        return { minPrice: null, listings: [] };
      }
    }
  }
  return { minPrice: null, listings: [] };
}

function broadcast(fastify, msg) {
  if (!fastify.websocketServer) return;
  const payload = JSON.stringify(msg);
  fastify.websocketServer.clients.forEach(c => {
    if (c.readyState === 1 && c.isBazaar) {
      try { c.send(payload); } catch(e){ fastify.log.error(`[wsBazaarPrice] broadcast error ${e.message}`); }
    }
  });
}

let missingNameChecked = new Set(); // mémorise les ids déjà testés sans succès

async function fetchSingleName(fastify, id) {
  // Évite re-queries incessantes si absent
  if (itemNameMap.has(id)) return;
  if (missingNameChecked.has(id)) return;
  if (!fastify.mongo) return;

  try {
  // Items globaux -> DB TORN
  const doc = await fastify.mongo.db('TORN')
      .collection('Items')
      .findOne({ id }, { projection: { name: 1 } });

    if (doc && doc.name) {
      itemNameMap.set(id, doc.name);
      missingNameChecked.delete(id); // au cas où on l’avait marqué absent
      fastify.log.debug(`[wsBazaarPrice] Nom résolu à la volée id=${id} name="${doc.name}"`);
    } else {
      missingNameChecked.add(id);
    }
  } catch (e) {
    fastify.log.warn(`[wsBazaarPrice] fetchSingleName échec id=${id}: ${e.message}`);
  }
}

async function cycle(fastify) {
  for (const id of Array.from(dynamicWatchSet)) {
    const { minPrice, listings } = await fetchListingsAndMin(fastify, id);

    let itemName = itemNameMap.get(id) || null;
    if (!itemName) {
      // Tentative de résolution immédiate
      await fetchSingleName(fastify, id);
      itemName = itemNameMap.get(id) || null;
    }

    if (!listings.length) {
      const prevB = lastBroadcastedMin.get(id);
      if (prevB !== null) { // ne broadcast que si on change (ex: on passe d'un prix à aucun)
        broadcast(fastify, {
          type: 'priceUpdate',
          time: Date.now(),
          itemId: id,
          itemName,
          minBazaar: null,
          listings: []
        });
        lastBroadcastedMin.set(id, null);
      }
      continue;
    }

  const minListing = listings.reduce((m, l) => l.price < m.price ? l : m, listings[0]);
    // Mise à jour des stores si variation détectée
    if (typeof minPrice === 'number' && isFinite(minPrice)) {
      const prev = lastMinPrices.get(id);
      if (prev == null || prev !== minPrice) {
        try {
          await updatePriceStores(fastify, id, minPrice, itemName);
          lastMinPrices.set(id, minPrice);
        } catch (e) {
          fastify.log.warn(`[wsBazaarPrice] updatePriceStores fail id=${id} ${e.message}`);
        }
      }
    }
    // Diffuser seulement si le min a changé comparé au dernier broadcast
    const prevBroadcast = lastBroadcastedMin.get(id);
    if (prevBroadcast == null || prevBroadcast !== minPrice) {
      broadcast(fastify, {
        type: 'priceUpdate',
        time: Date.now(),
        itemId: id,
        itemName,
        minBazaar: minPrice,
        listings: [minListing]
      });
      lastBroadcastedMin.set(id, minPrice);
    }
  }
}

async function updatePriceStores(fastify, itemId, price, itemName) {
  if (!fastify.mongo) return;
  try {
  const db = fastify.mongo.db('TORN'); // Items globaux
    const itemsCol = db.collection('Items');
    await itemsCol.updateOne({ id: itemId }, { $set: { price } });
    // Récupérer doc pour enrichir Redis (évite écraser champs)
    const doc = await itemsCol.findOne({ id: itemId });

    if (redis) {
      try {
        const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey');
        const key = `${ITEMS_KEY_PREFIX}${itemId}`;
        // Merge minimal: réécrire tout l'objet si doc existant, sinon simple objet
        const payload = doc || { id: itemId, price, name: itemName };
        await redis.sendCommand(['JSON.SET', key, '$', JSON.stringify(payload)]);
        try { await redis.expire(key, 86400); } catch(_){}
      } catch(e) {
        fastify.log.warn(`[wsBazaarPrice] Redis JSON.SET fail id=${itemId} ${e.message}`);
      }
      // Log variation dans une liste journalière
      try {
        const now = new Date();
        const dayKey = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}`;
        const listKey = `pricevars:${dayKey}:${itemId}`;
        await redis.rPush(listKey, JSON.stringify({ t: now.toISOString(), p: price }));
        try {
          const ttl = await redis.ttl(listKey);
          if (ttl === -1) await redis.expire(listKey, 60*60*24*3);
        } catch(_){}
      } catch(e) {
        fastify.log.debug(`[wsBazaarPrice] variation log fail id=${itemId} ${e.message}`);
      }
    }
  } catch (e) {
    fastify.log.warn(`[wsBazaarPrice] updatePriceStores Mongo fail id=${itemId} ${e.message}`);
  }
}

async function loadItemNames(fastify) {
  if (itemNameMap.size) return;
  const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey');
  // Scan per-item JSON keys
  if (redis) {
    try {
      let cursor = '0';
      const temp = new Map();
      const pattern = `${ITEMS_KEY_PREFIX}*`;
      do {
        let reply;
        try { reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 300 }); }
        catch { reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '300'); }
        if (reply && Array.isArray(reply)) {
          cursor = reply[0];
          const keys = reply[1];
          if (keys.length) {
            const multi = redis.multi();
            keys.forEach(k => multi.sendCommand(['JSON.GET', k, '$']));
            const res = await multi.exec();
            keys.forEach((k, idx) => {
              let raw = res[idx];
              if (Array.isArray(raw) && raw.length === 2) raw = raw[1];
              if (!raw) return;
              try {
                const parsed = JSON.parse(raw);
                const obj = Array.isArray(parsed) ? parsed[0] : parsed;
                if (obj && typeof obj.id === 'number' && obj.name) temp.set(obj.id, obj.name);
              } catch {}
            });
          }
        } else if (reply && typeof reply === 'object') {
          cursor = reply.cursor || '0';
        } else cursor = '0';
      } while (cursor !== '0');
      if (temp.size) {
        itemNameMap = temp;
        fastify.log.info(`[wsBazaarPrice] Names via per-item JSON keys (${itemNameMap.size})`);
        return;
      }
    } catch (e) {
      fastify.log.warn('[wsBazaarPrice] per-item scan fail '+e.message);
    }
  }
  // Mongo fallback
  if (fastify.mongo) {
    try {
  const items = await fastify.mongo.db('TORN').collection('Items')
        .find({}, { projection: { id:1, name:1 } })
        .toArray();
      itemNameMap = new Map(items.filter(d => d && d.name).map(d => [d.id, d.name]));
      fastify.log.info(`[wsBazaarPrice] Names from Mongo (${itemNameMap.size})`);
    } catch(e){
      fastify.log.error('[wsBazaarPrice] Mongo load fail '+e.message);
    }
  } else {
    fastify.log.warn('[wsBazaarPrice] fastify.mongo absent');
  }
}

// Extraction de la logique de peuplement initial pour pouvoir la lancer en tâche de fond
async function seedWatchSetFromMongo(fastify) {
  if (!fastify.mongo) {
    fastify.log.warn('[wsBazaarPrice] mongo not available to seed watch set');
    return;
  }
  const started = Date.now();
  try {
    const itemsCol = fastify.mongo.db('TORN').collection('Items');
    const cursor = itemsCol.find({ dailyPriceAverages: { $exists: true, $ne: null, $not: { $size: 0 } } }, { projection: { id:1 } });
    let added = 0, scanned = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      scanned++;
      if (doc && typeof doc.id === 'number' && !dynamicWatchSet.has(doc.id)) { dynamicWatchSet.add(doc.id); added++; }
      // Yield occasionnel pour ne pas monopoliser l'event loop si dataset massif
      if (scanned % 500 === 0) await sleep(0);
    }
    fastify.log.info(`[wsBazaarPrice] watch set seeded dailyPriceAverages added=${added} total=${dynamicWatchSet.size} in ${Date.now()-started}ms`);
  } catch (e) {
    fastify.log.warn('[wsBazaarPrice] seed watch set fail '+e.message);
  }
}

async function plugin(fastify, opts) {
  fastify.log.info('[wsBazaarPrice] init START (non-blocking)');

  redis = fastify.redis || opts.redisClient;

  if (!fastify.websocketServer) {
    fastify.log.warn('[wsBazaarPrice] websocketServer absent (enregistrer @fastify/websocket avant)');
    return; // on ne lance pas la suite
  }

  fastify.get('/wsb', { websocket: true }, (conn, req) => {
    const ws = conn.socket || conn;
    ws.isBazaar = true;
    // Stocker req pour accéder à la session (clé API utilisateur)
  // plus besoin de stocker la requête pour la clé API (clé globale utilisée)
    const PING_INTERVAL = parseInt(process.env.WSB_PING_INTERVAL_MS || '30000');
    const PONG_TIMEOUT = parseInt(process.env.WSB_PONG_TIMEOUT_MS || (PING_INTERVAL * 2).toString());
    let lastPong = Date.now();
    try {
      ws.send(JSON.stringify({ type:'welcome', time:Date.now() }));
      ws.send(JSON.stringify({ type:'watchList', items:Array.from(dynamicWatchSet) }));
    } catch(e){}
    const pingInt = setInterval(() => {
      if (ws.readyState === 1) {
        if (Date.now() - lastPong > PONG_TIMEOUT) {
          try { fastify.log.warn('[wsb] pong timeout; closing'); } catch(_){ }
          try { ws.terminate(); } catch(_){ }
          clearInterval(pingInt);
          return;
        }
        try { ws.ping(); } catch(_){ }
      } else clearInterval(pingInt);
    }, PING_INTERVAL);

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'watch' && Number.isFinite(msg.itemId) && msg.itemId > 0) {
        if (!dynamicWatchSet.has(msg.itemId)) {
          dynamicWatchSet.add(msg.itemId);
          fastify.log.info(`[wsBazaarPrice] watch add ${msg.itemId}`);
          try { ws.send(JSON.stringify({ type:'watchAck', itemId:msg.itemId, total:dynamicWatchSet.size })); } catch(_){}
        } else {
          try { ws.send(JSON.stringify({ type:'watchAck', itemId:msg.itemId, already:true, total:dynamicWatchSet.size })); } catch(_){}
        }
      } else if (msg.type === 'unwatch' && Number.isFinite(msg.itemId) && msg.itemId > 0) {
        if (dynamicWatchSet.delete(msg.itemId)) {
          fastify.log.info(`[wsBazaarPrice] watch remove ${msg.itemId}`);
          try { ws.send(JSON.stringify({ type:'unwatchAck', itemId:msg.itemId, total:dynamicWatchSet.size })); } catch(_){}
        } else {
          try { ws.send(JSON.stringify({ type:'unwatchAck', itemId:msg.itemId, missing:true, total:dynamicWatchSet.size })); } catch(_){}
        }
      }
    });

  ws.on('pong', () => { lastPong = Date.now(); });
  ws.on('close', () => clearInterval(pingInt));
    ws.on('error', err => fastify.log.error('[wsBazaarPrice] socket error '+err.message));
  });

  // Lancement asynchrone pour ne pas bloquer le démarrage fastify
  let interval; // sera assigné après première exécution
  setImmediate(() => {
    (async () => {
      const t0 = Date.now();
      try { await seedWatchSetFromMongo(fastify); } catch(e) {}
      try { await loadItemNames(fastify); } catch(e) { fastify.log.warn('[wsBazaarPrice] loadItemNames initial fail '+e.message); }
      const runCycle = async () => {
        try { await cycle(fastify); } catch(e){ fastify.log.error('[wsBazaarPrice] cycle error '+e.message); }
      };
      await runCycle();
      interval = setInterval(runCycle, REFRESH_MS);
      fastify.log.info(`[wsBazaarPrice] async init completed in ${Date.now()-t0}ms watch=${dynamicWatchSet.size} names=${itemNameMap.size}`);
    })();
  });

  fastify.addHook('onClose', (_i, done) => {
    if (interval) clearInterval(interval);
    done();
  });

  fastify.log.info('[wsBazaarPrice] init END (plugin returned)');
}

module.exports = fastifyPlugin(plugin);