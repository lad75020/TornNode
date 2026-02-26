module.exports = async function wsStats(socket, req, fastify, options = {}) {
    const makeSend = (objOrString) => {
        try {
            if (typeof objOrString === 'string') socket.send(objOrString); else socket.send(JSON.stringify(objOrString));
        } catch(_) {}
    };
    try {
        const dryRun = !!(options && options.dryRun);
        const requestId = options && options.requestId != null ? String(options.requestId) : null;
        const catRaw = options && typeof options.cat === 'string' ? options.cat.trim() : '';
        const { TornAPI } = require('torn-client');
        const apiKey = req && req.session ? req.session.TornAPIKey : null;
        if (!apiKey) {
            if (dryRun) {
                return makeSend({ type:'wsStatsTestResult', ok:false, requestId, error:'Invalid session: missing TornAPIKey' });
            }
            return makeSend({ type:'statsInsert', ok:false, inserted:false, error:'Invalid session', time:Date.now() });
        }
        const tornApiUrl = typeof process.env.TORN_API_URL === 'string' ? process.env.TORN_API_URL.replace(/\/+$/, '') : undefined;
        const tornClient = new TornAPI({
            apiKeys: [apiKey],
            ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
        });
        if (dryRun) {
            if (!catRaw) {
                return makeSend({ type:'wsStatsTestResult', ok:false, requestId, error:'cat is required' });
            }
            try {
                const apiResponse = await tornClient.user.personalstats({ cat: catRaw });
                let serializable = apiResponse;
                try { serializable = JSON.parse(JSON.stringify(apiResponse)); } catch (_) {}
                return makeSend({ type:'wsStatsTestResult', ok:true, requestId, cat: catRaw, response: serializable });
            } catch (e) {
                const errMsg = e && e.message ? e.message : String(e);
                return makeSend({ type:'wsStatsTestResult', ok:false, requestId, cat: catRaw, error: errMsg });
            }
        }
    const getUserDb = require('../utils/getUserDb.cjs');
    const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
    await ensureUserDbStructure(fastify, req.session.userID, fastify?.log || null);
    const db = getUserDb(fastify, req);
        const collection = db.collection('Stats');

        // Vérifier si une entrée existe dans les 12 dernières heures
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const recentDoc = await collection.findOne({ date: { $gte: twelveHoursAgo } });
        if (recentDoc) {
            return makeSend({
                type: 'statsInsert',
                ok: true,
                inserted: false,
                reason: 'recentEntryExists',
                lastDate: recentDoc.date,
                message: 'Not inserting Stats (recent entry < 12h)',
                time: Date.now()
            });
        }

        // Appel API Torn (stats complètes)
        const data = await tornClient.user.personalstats({ cat: 'all' });
        const doc = { ...data, date: new Date() };
        await collection.insertOne(doc);
        return makeSend({ type:'statsInsert', ok:true, inserted:true, date: doc.date, message:'Stats inserted successfully', time:Date.now() });
    } catch (e) {
        if (fastify?.log) { try { fastify.log.error('[wsStats] '+e.message); } catch(_){} }
        if (options && options.dryRun) {
            const requestId = options && options.requestId != null ? String(options.requestId) : null;
            return makeSend({ type:'wsStatsTestResult', ok:false, requestId, error:e.message });
        }
        return makeSend({ type:'statsInsert', ok:false, inserted:false, error:e.message, time:Date.now() });
    }
};
