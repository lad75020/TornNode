module.exports = async function wsStats(socket, req, client, fastify) {
    const makeSend = (objOrString) => {
        try {
            if (typeof objOrString === 'string') socket.send(objOrString); else socket.send(JSON.stringify(objOrString));
        } catch(_) {}
    };
    try {
        if (!req?.session?.TornAPIKey) {
            return makeSend({ type:'statsInsert', ok:false, inserted:false, error:'Invalid session', time:Date.now() });
        }
        const getUserDb = require('../utils/getUserDb');
        const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
        await ensureUserDbStructure(client, req.session.userID, fastify?.log || null);
        const db = getUserDb(client, req);
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
        const url = `${process.env.TORN_API_URL}user/personalstats?cat=all`;
        const headers = { 'Authorization': `ApiKey ${req.session.TornAPIKey}` };
        const response = await fetch(url, { headers });
        if (!response.ok) {
            return makeSend({ type:'statsInsert', ok:false, inserted:false, error:`HTTP ${response.status}`, time:Date.now() });
        }
        const data = await response.json();
        const doc = { ...data, date: new Date() };
        await collection.insertOne(doc);
        return makeSend({ type:'statsInsert', ok:true, inserted:true, date: doc.date, message:'Stats inserted successfully', time:Date.now() });
    } catch (e) {
        if (fastify?.log) { try { fastify.log.error('[wsStats] '+e.message); } catch(_){} }
        return makeSend({ type:'statsInsert', ok:false, inserted:false, error:e.message, time:Date.now() });
    }
};