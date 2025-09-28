module.exports = async function wsGetAllTornItems(socket, req, fastify, parsed) {

  const redisClient = fastify.redis;
  const { ITEMS_KEY_PREFIX, REQUIRED_ITEM_FIELDS } = require('../utils/itemsCacheKey.cjs');
  try {
    let docs;
    if (redisClient) {
      const pattern = `${ITEMS_KEY_PREFIX}*`;
      let cursor = '0';
      const results = [];
      try {
        do {
          let reply;
          try { reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 400 }); }
          catch { reply = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', '400'); }
          if (reply && Array.isArray(reply)) {
            cursor = reply[0];
            const keys = reply[1];
            if (keys.length) {
              const multi = redisClient.multi();
              keys.forEach(k => multi.sendCommand(['JSON.GET', k, '$']));
              const jsonRes = await multi.exec();
              keys.forEach((k, idx) => {
                let val = jsonRes[idx];
                if (Array.isArray(val) && val.length === 2) val = val[1];
                if (!val) return;
                try {
                  const parsed = JSON.parse(val);
                  const obj = Array.isArray(parsed) ? parsed[0] : parsed;
                  if (obj && typeof obj === 'object') results.push(obj);
                } catch {}
              });
            }
          } else if (reply && typeof reply === 'object') {
            cursor = reply.cursor || '0';
          } else {
            cursor = '0';
          }
        } while (cursor !== '0');
      } catch (e) {
        fastify.log.warn('[wsGetAllTornItems] per-item scan fail '+e.message);
      }
      if (results.length) docs = results;
    }
    const isIncomplete = docs && docs.some(it => !it || REQUIRED_ITEM_FIELDS.some(f => typeof it[f] === 'undefined'));
    if (docs && !isIncomplete) {
      try { socket.send(JSON.stringify({ type:'getAllTornItems', ok:true, items: docs })); } catch {}
      return;
    } else if (isIncomplete) {
  fastify && fastify.log && fastify.log.info('[wsGetAllTornItems] Incomplete cache -> reload Mongo');
    }
    // Mongo fallback + repopulate individual JSON keys (chunked & robust)
  const database = (typeof fastify.mongo.db === 'function' ? fastify.mongo.db('TORN') : fastify.mongo.client.db('TORN'));
    const itemsCollection = database.collection('Items');
    // Inclure explicitement les champs requis (si d'autres champs existent ils seront aussi conservés)
    const documents = await itemsCollection.find({}, { projection: { _id:0 } }).toArray();
    if (redisClient) {
      const CHUNK_SIZE = 200;
      let idx = 0;
      let written = 0;
      let errors = 0;
      const total = documents.length;
      const writeChunk = async (chunk) => {
        if (!chunk.length) return;
        let canPipeline = false; let multi;
        try {
          multi = redisClient.multi();
          // ioredis: multi.addCommand n'existe pas; node-redis v4: multi.addCommand existe; fallback sur multi.sendCommand si présent
          canPipeline = !!multi && (typeof multi.addCommand === 'function' || typeof multi.sendCommand === 'function');
        } catch { canPipeline = false; }
        if (canPipeline) {
          for (const it of chunk) {
            if (!it || typeof it.id === 'undefined') continue;
            const k = `${ITEMS_KEY_PREFIX}${it.id}`;
            const cmdArr = ['JSON.SET', k, '$', JSON.stringify(it)];
            try {
              if (typeof multi.addCommand === 'function') multi.addCommand(cmdArr); else multi.sendCommand(cmdArr);
              // EXPIRE séparé (24h) – ne pas échouer si absent
              const expCmd = ['EXPIRE', k, '86400'];
              if (typeof multi.addCommand === 'function') multi.addCommand(expCmd); else multi.sendCommand(expCmd);
            } catch (e) {
              errors++; // compté comme erreur d'empilement
            }
          }
          try {
            const res = await multi.exec();
            if (Array.isArray(res)) {
              // Chaque item => 2 commandes (SET, EXPIRE). Compter SET succès.
              // On parcourt par pas de 2.
              for (let i=0;i<res.length;i+=2) {
                const rSet = res[i];
                if (rSet instanceof Error) errors++; else written++;
              }
            }
          } catch (e) {
            errors += chunk.length;
            fastify.log.warn('[wsGetAllTornItems] pipeline exec fail '+e.message);
          }
        } else {
          // Séquentiel
            for (const it of chunk) {
              if (!it || typeof it.id === 'undefined') continue;
              const k = `${ITEMS_KEY_PREFIX}${it.id}`;
              try {
                await redisClient.sendCommand(['JSON.SET', k, '$', JSON.stringify(it)]);
                try { await redisClient.sendCommand(['EXPIRE', k, '86400']); } catch {}
                written++;
              } catch (e) { errors++; }
            }
        }
      };
      while (idx < documents.length) {
        const slice = documents.slice(idx, idx + CHUNK_SIZE);
        await writeChunk(slice);
        idx += CHUNK_SIZE;
        if (idx % (CHUNK_SIZE*5) === 0) {
          fastify.log.info(`[wsGetAllTornItems] repop progress ${idx}/${total}`);
        }
      }
      fastify.log.info(`[wsGetAllTornItems] repop done total=${total} written=${written} errors=${errors}`);
    }
    try { socket.send(JSON.stringify({ type:'getAllTornItems', ok:true, items: documents })); } catch {}
  } catch (e) {
    try { socket.send(JSON.stringify({ type:'getAllTornItems', ok:false, error:e.message })); } catch {}
  }
};
