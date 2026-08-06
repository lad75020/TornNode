module.exports = async function (req, fastify, socket) {
    const makeSend = (objOrString) => {
        try {
            if (typeof objOrString === 'string') {
                socket.send(objOrString);
            } else {
                socket.send(JSON.stringify(objOrString));
            }
        } catch (_) {}
    };
    try {
        const { TornAPI } = require('torn-client');
        const apiKey = req && req.session ? req.session.TornAPIKey : null;
        if (!apiKey) {
            return makeSend({ type:'networthInsert', ok:false, inserted:false, error:'Invalid session', time:Date.now() });
        }
        const tornApiUrl = typeof process.env.TORN_API_URL === 'string' ? process.env.TORN_API_URL.replace(/\/+$/, '') : undefined;
        const tornClient = new TornAPI({
            apiKeys: [apiKey],
            ...(tornApiUrl ? { apiUrl: tornApiUrl } : {}),
        });
        // DB par utilisateur
        const getUserDb = require('../utils/getUserDb.cjs');
        let database;
        try {
            const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
            await ensureUserDbStructure(fastify, req.session.userId, null);
            database = getUserDb(fastify, req);
        }
        catch(e){
            return makeSend({ type:'networthInsert', ok:false, inserted:false, error:e.message, time:Date.now() });
        }

        const networthCollection = database.collection('Networth');
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        const existingDocument = await networthCollection.findOne({ date: { $gte: twelveHoursAgo } });
        if (existingDocument) {
            return makeSend({
                type: 'networthInsert',
                ok: true,
                inserted: false,
                reason: 'recentEntryExists',
                message: 'Not inserting Networth (recent entry < 12h)',
                lastDate: existingDocument.date,
                time: Date.now()
            });
        }

        const networth = await tornClient.user.money();
        
        networth.date = new Date();
        await networthCollection.insertOne(networth);
        return makeSend({
            type: 'networthInsert',
            ok: true,
            inserted: true,
            value: networth.money.daily_networth,
            date: networth.date,
            message: 'Networth inserted successfully',
        });
    } catch (error) {
        return makeSend({
            type: 'networthInsert',
            ok: false,
            inserted: false,
            error: error.message,
            time: Date.now()
        });
    }
};
