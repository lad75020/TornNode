module.exports = async function wsTorn(socket, req, fastify, options = {}) {
try {
    const { TornAPI } = require('torn-client');
    const fromNum = Number(options && options.from);
    const toNum = Number(options && options.to);
    const fromOverride = Number.isFinite(fromNum) ? Math.floor(fromNum) : null;
    const toOverride = Number.isFinite(toNum) ? Math.floor(toNum) : null;
    const dryRun = !!(options && options.dryRun);
    const requestId = options && options.requestId != null ? String(options.requestId) : null;
    const apiKey = req && req.session ? req.session.TornAPIKey : null;
    if (!apiKey) {
        if (dryRun) {
            try { socket.send(JSON.stringify({ type: 'wsTornTestResult', ok: false, requestId, error: 'Invalid session: missing TornAPIKey' })); } catch {}
        } else {
            try { socket.send(JSON.stringify({ type:'importProgress', kind:'logs', error: 'Invalid session: missing TornAPIKey' })); } catch {}
        }
        return;
    }
    const tornApiUrl = typeof process.env.TORN_API_URL === 'string' ? process.env.TORN_API_URL.replace(/\/+$/, '') : undefined;
    const tornClient = new TornAPI({
        apiKeys: [apiKey],
        ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
    });

    if (dryRun) {
        if (fromOverride == null || toOverride == null) {
            try {
                socket.send(JSON.stringify({
                    type: 'wsTornTestResult',
                    ok: false,
                    requestId,
                    error: 'from and to are required integers (unix seconds)'
                }));
            } catch {}
            return;
        }
        if (fromOverride > toOverride) {
            try {
                socket.send(JSON.stringify({
                    type: 'wsTornTestResult',
                    ok: false,
                    requestId,
                    error: 'from must be <= to'
                }));
            } catch {}
            return;
        }
        try {
            fastify && fastify.log && fastify.log.info(`[wsTorn] dry-run logs from=${fromOverride} to=${toOverride}`);
            const apiResponse = await tornClient.user.log({ from: fromOverride, to: toOverride });
            let serializable = apiResponse;
            try { serializable = JSON.parse(JSON.stringify(apiResponse)); } catch (_) {}
            try {
                socket.send(JSON.stringify({
                    type: 'wsTornTestResult',
                    ok: true,
                    requestId,
                    from: fromOverride,
                    to: toOverride,
                    response: serializable
                }));
            } catch {}
        } catch (e) {
            const errMsg = e && e.message ? e.message : String(e);
            fastify && fastify.log && fastify.log.warn(`[wsTorn] dry-run request failed from=${fromOverride} to=${toOverride} ${errMsg}`);
            try {
                socket.send(JSON.stringify({
                    type: 'wsTornTestResult',
                    ok: false,
                    requestId,
                    from: fromOverride,
                    to: toOverride,
                    error: errMsg
                }));
            } catch {}
        }
        return;
    }

    const getUserDb = require('../utils/getUserDb.cjs');
    const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
    await ensureUserDbStructure(fastify, req.session.userID, fastify && fastify.log);
    const database = getUserDb(fastify, req);
        // S'assurer des collections clés (créées sur demande par Mongo sinon).
        const logsCollection = database.collection('logs');
        // Future extension: pré-créer d'autres collections si nécessaire.
        const nowSec = Math.floor(Date.now() / 1000);
        const INTERVAL = 900; // 15 min
        let startTs;
        if (fromOverride != null) {
            startTs = fromOverride;
        } else {
            let lastDoc = await logsCollection.findOne({}, { sort: { timestamp: -1 }, limit: 1 });
            if (!lastDoc) {
                // Fallback demandé: démarrer à timestamp fixe historique
                lastDoc = { timestamp: 1716574649 };
            }
            startTs = lastDoc.timestamp + 1;
        }
        const endTs = toOverride != null ? toOverride : nowSec;
        if (startTs > endTs) {
            try { socket.send(JSON.stringify({ type:'importedData', logsImported: 0, note:'up-to-date'})); } catch {}
            return;
        }
        let countInserted = 0;
        let lastProgressSent = -5; // force première émission
        for (let t = startTs; t <= endTs; t += INTERVAL) {
            if (socket.__stopImport && socket.__stopImport.logs) {
                try { socket.send(JSON.stringify({ type:'importStopped', kind:'logs', percent: null })); } catch {}
                return;
            }
            const to = Math.min(t + INTERVAL, endTs);
            let jsonLogs;
            try {
                fastify.log.info(`[wsTorn] fetching logs from=${t} to=${to}`);
                jsonLogs = await tornClient.user.log({ from: t, to });
            } catch (e) {
                if (e && typeof e.code === 'number') {
                    fastify && fastify.log && fastify.log.warn(`[wsTorn] API error code=${e.code} msg=${e.message}`);
                    await new Promise(r => setTimeout(r, 10000));
                    t -= INTERVAL;
                    continue;
                }
                fastify && fastify.log && fastify.log.warn(`[wsTorn] request fail segment from=${t} to=${to} ${e.message}`);
                continue;
            }
            if (jsonLogs && jsonLogs.error) {
                fastify && fastify.log && fastify.log.warn(`[wsTorn] API error code=${jsonLogs.error.code} msg=${jsonLogs.error.error}`);
                await new Promise(r => setTimeout(r, 10000));
                t -= INTERVAL;
                continue;
            }
            const logBlock = jsonLogs && jsonLogs.log ? jsonLogs.log : null;
            if (logBlock && typeof logBlock === 'object') {
                for (const [, value] of Object.entries(logBlock)) {
                    if (!value || typeof value !== 'object') continue;
                        // Validation minimale
                    if (typeof value.timestamp !== 'number') continue;
                    value.date = new Date(value.timestamp * 1000);
                    value._id = value.id;
                    if ((value.log === 9020) || (value.details && value.details.id === 9020)) {
                        try {
                            const itemsGained = value && value.data ? value.data.items_gained : null;
                            // Collect numeric IDs from items_gained (object keys preferred; fallback to array of objects)
                            let ids = [];
                            if (itemsGained && typeof itemsGained === 'object' && !Array.isArray(itemsGained)) {
                                ids = Object.keys(itemsGained).map(k => Number(k)).filter(n => Number.isFinite(n));
                            } else if (Array.isArray(itemsGained)) {
                                ids = itemsGained.map(it => Number(it && (it.id != null ? it.id : it.item_id))).filter(n => Number.isFinite(n));
                            }
                            const redis = fastify && fastify.redis;
                            const names = [];
                            if (redis && ids && ids.length) {
                                const { ITEMS_KEY_PREFIX } = require('../utils/itemsCacheKey.cjs');
                                let multi, canPipeline = false;
                                try { multi = redis.multi(); canPipeline = !!multi; } catch (_) { canPipeline = false; }
                                if (canPipeline) {
                                    ids.forEach(id => {
                                        const cmd = ['JSON.GET', `${ITEMS_KEY_PREFIX}${id}`, '$.name'];
                                        if (typeof multi.addCommand === 'function') multi.addCommand(cmd); else multi.sendCommand(cmd);
                                    });
                                    const res = await multi.exec();
                                    const arr = Array.isArray(res) ? res : [];
                                    for (const r of arr) {
                                        let v = Array.isArray(r) ? r[1] : r;
                                        if (typeof v === 'string' && v.length) {
                                            try {
                                                const parsed = JSON.parse(v); // RedisJSON returns JSON string, e.g., ["Name"]
                                                const nameVal = Array.isArray(parsed) ? parsed[0] : parsed;
                                                if (typeof nameVal === 'string') names.push(nameVal);
                                            } catch(_) {}
                                        }
                                    }
                                } else {
                                    // Fallback sequential
                                    for (const id of ids) {
                                        try {
                                            const raw = await redis.sendCommand(['JSON.GET', `${ITEMS_KEY_PREFIX}${id}`, '$.name']);
                                            if (typeof raw === 'string' && raw.length) {
                                                const parsed = JSON.parse(raw);
                                                const nameVal = Array.isArray(parsed) ? parsed[0] : parsed;
                                                if (typeof nameVal === 'string') names.push(nameVal);
                                            }
                                        } catch(_) {}
                                    }
                                }
                            }
                            // Deduplicate and assign to value.data.items_names
                            const seen = new Set();
                            if (!value.data || typeof value.data !== 'object') value.data = {};
                            value.data.items_names = names.filter(n => (n && (seen.has(n) ? false : (seen.add(n), true))));
                        } catch (_) {
                            try { if (!value.data) value.data = {}; value.data.items_names = []; } catch {}
                        }
                    }
                    
                    delete value.id;
                    if (value.details) {
                        value.log = value.details.id;
                        value.title = value.details.title;
                        value.category = value.details.category;
                        delete value.details;
                    }
                    try { await logsCollection.insertOne(value); countInserted++; } catch(e){ /* duplicate ou autre */ }
                }
            }
            const done = Math.min(to, endTs) - startTs;
            const total = endTs - startTs || 1;
            const percent = Math.min(100, (done / total) * 100);
            if (percent - lastProgressSent >= 2 || percent >= 100) {
                lastProgressSent = percent;
                try { socket.send(JSON.stringify({ type:'importProgress', kind:'logs', percent: Number(percent.toFixed(1)), currentTs: to, startTs, endTs, inserted: countInserted })); } catch {}
            }
            // Petite pause pour réduire la charge et laisser respirer event loop
            fastify.log.info(`[wsTorn] import progress ${percent}% from ${startTs} to ${endTs} imported : ${countInserted}`);
                        // Pause + check stop après chaque segment
                        for (let i=0;i<15;i++) { // 15 *100ms = 1.5s approx
                            if (socket.__stopImport && socket.__stopImport.logs) {
                                try { socket.send(JSON.stringify({ type:'importStopped', kind:'logs' })); } catch {}
                                return;
                            }
                            await new Promise(r => setTimeout(r, 100));
                        }
        }
            try { socket.send(JSON.stringify({ type:'importedData', logsImported: countInserted })); } catch {}
            // Libère le verrou côté socket pour permettre tornAttacks puis déclenche si demandé
            try {
                const hadDeferred = socket.__deferredTornAttacks === true;
                socket.__importingLogs = false;
                if (hadDeferred) {
                    socket.__deferredTornAttacks = false;
                    // Déclenche immédiatement attaques maintenant que les logs sont prêts
                    try { require('./wsTornAttacks.cjs')(socket, req, fastify); } catch(e){ fastify && fastify.log && fastify.log.error(e); }
                }
            } catch {}
    } catch (error) {
            try { socket.send(JSON.stringify({ type:'importProgress', kind:'logs', error: error.message })); } catch {}
            try {
                const hadDeferred = socket.__deferredTornAttacks === true;
                socket.__importingLogs = false;
                if (hadDeferred) {
                    socket.__deferredTornAttacks = false;
                    try { require('./wsTornAttacks.cjs')(socket, req, fastify); } catch(e){ fastify && fastify.log && fastify.log.error(e); }
                }
            } catch {}
    }
};
