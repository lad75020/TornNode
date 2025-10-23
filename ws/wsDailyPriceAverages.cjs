/* eslint-disable no-empty */
// Envoie toutes les courbes dailyPriceAverages pour chaque item
module.exports = async function wsDailyPriceAverages(socket, req, fastify) {
  // Public access: allow sending aggregated daily averages without requiring a user API key.
  // This endpoint only returns non-sensitive, aggregated item price history.
  try {
  const col = (typeof fastify.mongo.db === 'function' ? fastify.mongo.db('TORN') : fastify.mongo.client.db('TORN')).collection('Items');
    // Projection limitée: id, name, dailyPriceAverages
    const cursor = col.find({ dailyPriceAverages: { $exists: true, $type: 'array', $ne: [] } }, { projection: { id:1, name:1, dailyPriceAverages:1, _id:0 } });
    const lines = [];
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc || typeof doc.id === 'undefined') continue;
      const series = Array.isArray(doc.dailyPriceAverages) ? doc.dailyPriceAverages.filter(p => p && p.date && typeof p.avg === 'number') : [];
      if (!series.length) continue;
      lines.push({ id: doc.id, name: doc.name, points: series.map(p => ({ date: p.date, avg: p.avg })) });
    }
    try { socket.send(JSON.stringify({ type:'dailyPriceAveragesAll', ok:true, lines })); } catch {}
  } catch (e) {
    fastify && fastify.log && fastify.log.error('[wsDailyPriceAverages] '+e.message);
    try { socket.send(JSON.stringify({ type:'dailyPriceAveragesAll', ok:false, error:e.message })); } catch {}
  }
};
