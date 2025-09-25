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
        // DB par utilisateur
        const getUserDb = require('../utils/getUserDb.cjs');
        let database;
        try {
            const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
            await ensureUserDbStructure(fastify, req.session.userID, null);
            database = getUserDb(fastify, req);
        }
        catch(e){
            return makeSend({ type:'networthInsert', ok:false, inserted:false, error:e.message, time:Date.now() });
        }
        const headers = {
            'Authorization': `ApiKey ${req.session.TornAPIKey}`
        };

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

        const response = await fetch(`${process.env.TORN_API_URL}user/money`, { headers });
        if (!response.ok) {
            return makeSend({
                type: 'networthInsert',
                ok: false,
                inserted: false,
                error: `HTTP ${response.status}`,
                time: Date.now()
            });
        }
        const networth = await response.json();
        
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