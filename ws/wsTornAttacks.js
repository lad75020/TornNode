module.exports = async function (socket, req,client) { 
   try {
    const getUserDb = require('../utils/getUserDb');
    const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
    await ensureUserDbStructure(client, req.session.userID, null);
    const database = getUserDb(client, req);
        const INTERVAL = 86400;
    const attacksCollection = database.collection('attacks');

        const headers = {
            'Authorization': `ApiKey ${req.session.TornAPIKey}`
        };

    let doc = await attacksCollection.findOne({}, { sort: { ended: -1 }, limit: 1 });
    const nowSec = Math.floor(Date.now() / 1000);
    if (!doc) { doc = { ended: 1716757478 }; } // fallback J-7
    const startTs = doc.ended;
    const endTs = nowSec + INTERVAL; // même logique initiale
    let countInserted = 0;
    let lastProgressSent = 0;
    for (let t = startTs; t <= endTs; t += INTERVAL) {
            if (socket.__stopImport && socket.__stopImport.attacks) {
                try { socket.send(JSON.stringify({ type:'importStopped', kind:'attacks' })); } catch {}
                return;
            }
            const response = await fetch(`${process.env.TORN_API_URL}user/attacks?from=${t}&to=${t + INTERVAL}`, { headers });
            const jsonLogs = await response.json();

            if (jsonLogs.attacks) {
                for (const [property, value] of Object.entries(jsonLogs.attacks)) {
                    if (await attacksCollection.countDocuments({ code: value.code }) === 0) {
                        countInserted++;
                        value.date_started = new Date(value.started * 1000);
                        value.date_ended = new Date(value.ended * 1000);
                        await attacksCollection.insertOne(value);
                    }
                }
            }

            //socket.send(new Date(t * 1000).toISOString().split('.')[0].replace('T', ' '));
            // Progress calc – clamp t to endTs in case of single-interval or overshoot scenarios
            const done = Math.min(t, endTs) - startTs;
            const total = endTs - startTs || 1;
            const percent = Math.min(100, (done / total) * 100);
            if (percent - lastProgressSent >= 2 || percent >= 100) {
                lastProgressSent = percent;
                try { socket.send(JSON.stringify({ type:'importProgress', kind:'attacks', percent: Number(percent.toFixed(1)), currentTs: t, startTs, endTs })); } catch {}
            }
            for (let i=0;i<40;i++) { // 40*100ms ~4s
                if (socket.__stopImport && socket.__stopImport.attacks) {
                    try { socket.send(JSON.stringify({ type:'importStopped', kind:'attacks' })); } catch {}
                    return;
                }
                await new Promise(r => setTimeout(r, 100));
            }
        }
        // Assure l'émission d'un 100% si boucle unique (total < INTERVAL) ou si seuils de 2% ont sauté la valeur finale
        if (lastProgressSent < 100) {
            try { socket.send(JSON.stringify({ type:'importProgress', kind:'attacks', percent: 100, currentTs: endTs, startTs, endTs })); } catch {}
        }
        socket.send(JSON.stringify({type : "importedData",attacksImported: countInserted}));
    } catch (error) {
        socket.send(JSON.stringify({error: error.message}));
    }
}