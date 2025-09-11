module.exports = async function wsTorn(socket, req, client, fastify) {
    try {
        if (!req.session || !req.session.TornAPIKey) {
            try { socket.send(JSON.stringify({ type:'importProgress', kind:'logs', error:'unauthorized'})); } catch {}
            return;
        }
        const getUserDb = require('../utils/getUserDb');
        const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
        await ensureUserDbStructure(client, req.session.userID, fastify && fastify.log);
        const database = getUserDb(client, req);
        // S'assurer des collections clés (créées sur demande par Mongo sinon).
        const logsCollection = database.collection('logs');
        // Future extension: pré-créer d'autres collections si nécessaire.
        const nowSec = Math.floor(Date.now() / 1000);
        const INTERVAL = 900; // 15 min
        let lastDoc = await logsCollection.findOne({}, { sort: { timestamp: -1 }, limit: 1 });
        if (!lastDoc) {
            // Fallback demandé: démarrer à timestamp fixe historique
            lastDoc = { timestamp: 1716574649 };
        }
        const startTs = lastDoc.timestamp + 1;
        const endTs = nowSec;
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
                const url = `${process.env.TORN_API_URL}user?selections=log&key=${req.session.TornAPIKey}&from=${t}&to=${to}`;
                const response = await fetch(url);
                jsonLogs = await response.json();
            } catch (e) {
                fastify && fastify.log && fastify.log.warn(`[wsTorn] fetch fail segment from=${t} to=${to} ${e.message}`);
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
                    try { require('./wsTornAttacks')(socket, req, client); } catch(e){ fastify && fastify.log && fastify.log.error(e); }
                }
            } catch {}
    } catch (error) {
            try { socket.send(JSON.stringify({ type:'importProgress', kind:'logs', error: error.message })); } catch {}
            try {
                const hadDeferred = socket.__deferredTornAttacks === true;
                socket.__importingLogs = false;
                if (hadDeferred) {
                    socket.__deferredTornAttacks = false;
                    try { require('./wsTornAttacks')(socket, req, client); } catch(e){ fastify && fastify.log && fastify.log.error(e); }
                }
            } catch {}
    }
};
