// Warmup et validation du cache Redis per-item JSON
// Écrit chaque document Items dans une clé JSON: tornItems:<version>:<id>
// Fournit un résumé (attendu, écrit, erreurs, durée) + validation scan.

module.exports = async function warmupItemsCache({ fastify, redisClient }) {
  redisClient = redisClient || fastify.redis;
  const startGlobal = Date.now();
  const log = fastify.log;
  const { ITEMS_KEY_PREFIX } = require('./itemsCacheKey.cjs');
  const col = fastify.mongo.client.db('TORN').collection('Items');
  const expected = await col.estimatedDocumentCount();
  log.info(`[warmup] start expected=${expected}`);
  // Probe RedisJSON availability
  try {
    await redisClient.sendCommand(['JSON.SET','__json_probe__','$','1']);
    await redisClient.del('__json_probe__');
  } catch (e) {
    log.error('[warmup] RedisJSON indisponible: '+e.message+' (abandon)');
    return;
  }
  const cursor = col.find({}, { projection: { _id: 0 } });
  const CHUNK_SIZE = 200;
  let chunk = [];
  let fetched = 0;
  let written = 0; // nombre d'items écrits
  let errors = 0;

  async function flush() {
    if (!chunk.length) return;
    let itemsInBatch = 0;
    // On tente un pipeline si l'implémentation le supporte (multi.addCommand ou équivalent), sinon fallback séquentiel.
    let canPipeline = false;
    let multi;
    try {
      multi = redisClient.multi();
      canPipeline = multi && typeof multi.addCommand === 'function';
    } catch { canPipeline = false; }

    if (canPipeline) {
      for (const doc of chunk) {
        if (!doc || typeof doc.id === 'undefined') continue;
        const k = `${ITEMS_KEY_PREFIX}${doc.id}`;
        multi.addCommand(['JSON.SET', k, '$', JSON.stringify(doc)]);
        multi.addCommand(['EXPIRE', k, '86400']);
        itemsInBatch++;
      }
      try {
        const res = await multi.exec();
        if (Array.isArray(res)) {
          let setErrors = 0;
            for (let i=0;i<res.length;i+=2) {
              const rSet = res[i];
              if (rSet instanceof Error) setErrors++;
            }
          errors += setErrors;
          written += (itemsInBatch - setErrors);
        }
      } catch (e) {
        errors += itemsInBatch;
        log.warn('[warmup] batch exec fail '+e.message);
      }
    } else {
      // Fallback séquentiel (plus lent, mais fiable)
      for (const doc of chunk) {
        if (!doc || typeof doc.id === 'undefined') continue;
        const k = `${ITEMS_KEY_PREFIX}${doc.id}`;
        try {
          await redisClient.sendCommand(['JSON.SET', k, '$', JSON.stringify(doc)]);
          await redisClient.sendCommand(['EXPIRE', k, '86400']);
          written++;
        } catch (e) {
          errors++;
          log.warn(`[warmup] set fail id=${doc.id} ${e.message}`);
        }
        itemsInBatch++;
      }
    }
    chunk = [];
  }

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    fetched++;
    chunk.push(doc);
    if (chunk.length >= CHUNK_SIZE) {
      await flush();
      if (fetched % (CHUNK_SIZE * 5) === 0) {
        log.info(`[warmup] progress fetched=${fetched}`);
      }
    }
  }
  await flush();
  // written déjà exact (items réussis)

  // Validation rapide via SCAN comptage
  let scanCount = 0;
  try {
    let cursorScan = '0';
    const pattern = `${ITEMS_KEY_PREFIX}*`;
    do {
      let reply;
      try { reply = await redisClient.scan(cursorScan, { MATCH: pattern, COUNT: 1000 }); }
      catch { reply = await redisClient.scan(cursorScan, 'MATCH', pattern, 'COUNT', '1000'); }
      if (Array.isArray(reply)) {
        cursorScan = reply[0];
        const keys = reply[1];
        scanCount += keys.length;
      } else if (reply && typeof reply === 'object') {
        cursorScan = reply.cursor || '0';
        if (Array.isArray(reply.keys)) scanCount += reply.keys.length;
      } else {
        cursorScan = '0';
      }
    } while (cursorScan !== '0');
  } catch (e) {
    log.warn('[warmup] validation scan fail '+e.message);
  }

  const duration = Date.now() - startGlobal;
  log.info(`[warmup] end fetched=${fetched} written≈${written} scanKeys=${scanCount} expected=${expected} errors=${errors} ms=${duration}`);
  const missing = expected - scanCount;
  if (missing > 0) {
    log.warn(`[warmup] missingKeys=${missing} (diff expected-scan). Un job incremental va tenter de compléter.`);
    // Job incremental simple: récupérer ids manquants via Mongo et SET s'ils n'existent pas.
    try {
      const idsExisting = new Set();
      // Re-scan pour collecter ids existants (parsers rapides sur suffixe)
      let c2 = '0';
      const pattern2 = `${ITEMS_KEY_PREFIX}*`;
      do {
        let rep;
        try { rep = await redisClient.scan(c2, { MATCH: pattern2, COUNT: 1000 }); }
        catch { rep = await redisClient.scan(c2, 'MATCH', pattern2, 'COUNT', '1000'); }
        if (Array.isArray(rep)) {
          c2 = rep[0];
          rep[1].forEach(k => { const idPart = k.substring(ITEMS_KEY_PREFIX.length); const idNum = parseInt(idPart); if (Number.isFinite(idNum)) idsExisting.add(idNum); });
        } else if (rep && typeof rep === 'object') {
          c2 = rep.cursor || '0';
          (rep.keys||[]).forEach(k => { const idPart = k.substring(ITEMS_KEY_PREFIX.length); const idNum = parseInt(idPart); if (Number.isFinite(idNum)) idsExisting.add(idNum); });
        } else c2='0';
      } while (c2 !== '0');
      const allDocs = await col.find({}, { projection:{ _id:0 } }).toArray();
      const toWrite = allDocs.filter(d => d && typeof d.id === 'number' && !idsExisting.has(d.id));
      if (toWrite.length) {
        log.info(`[warmup] incremental pass writing missing=${toWrite.length}`);
        let batch = [];
        for (const doc of toWrite) {
          batch.push(doc);
          if (batch.length === CHUNK_SIZE) {
            // Réutilise la logique flush allégée ici (détection pipeline / fallback)
            try {
              let canPipeline = false; let m;
              try { m = redisClient.multi(); canPipeline = m && typeof m.addCommand === 'function'; } catch { canPipeline = false; }
              if (canPipeline) {
                batch.forEach(b => { m.addCommand(['JSON.SET', `${ITEMS_KEY_PREFIX}${b.id}`, '$', JSON.stringify(b)]); m.addCommand(['EXPIRE', `${ITEMS_KEY_PREFIX}${b.id}`, '86400']); });
                await m.exec();
              } else {
                for (const b of batch) {
                  try { await redisClient.sendCommand(['JSON.SET', `${ITEMS_KEY_PREFIX}${b.id}`, '$', JSON.stringify(b)]); await redisClient.sendCommand(['EXPIRE', `${ITEMS_KEY_PREFIX}${b.id}`, '86400']); }
                  catch(e){ log.warn(`[warmup] incremental set fail id=${b.id} ${e.message}`); }
                }
              }
            } catch(e){ log.warn('[warmup] incremental exec fail '+e.message); }
            batch = [];
          }
        }
        if (batch.length) {
          try {
            let canPipeline = false; let m;
            try { m = redisClient.multi(); canPipeline = m && typeof m.addCommand === 'function'; } catch { canPipeline = false; }
            if (canPipeline) {
              batch.forEach(b => { m.addCommand(['JSON.SET', `${ITEMS_KEY_PREFIX}${b.id}`, '$', JSON.stringify(b)]); m.addCommand(['EXPIRE', `${ITEMS_KEY_PREFIX}${b.id}`, '86400']); });
              await m.exec();
            } else {
              for (const b of batch) {
                try { await redisClient.sendCommand(['JSON.SET', `${ITEMS_KEY_PREFIX}${b.id}`, '$', JSON.stringify(b)]); await redisClient.sendCommand(['EXPIRE', `${ITEMS_KEY_PREFIX}${b.id}`, '86400']); }
                catch(e){ log.warn(`[warmup] incremental set fail id=${b.id} ${e.message}`); }
              }
            }
          } catch(e){ log.warn('[warmup] incremental exec fail '+e.message); }
        }
        log.info('[warmup] incremental pass done');
      }
    } catch (e) {
      log.warn('[warmup] incremental pass failed '+e.message);
    }
  }
};
