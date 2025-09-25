// Historique des snapshots CompanyStock.
// Requête: { type:'getCompanyStockHistory', from?:<ms|s>, to?:<ms|s>, top?:number }
// Stockage actuel (wsCompanyStock): insertOne({ timestamp, stocks: company_stock }) où company_stock est un objet clé -> item.
// Compat: certains anciens documents peuvent contenir 'stock' (array ou objet). On normalise.

module.exports = async function wsGetCompanyStockHistory(socket, req, fastify, parsed) {
  const base = { type:'getCompanyStockHistory' };
  if (!req.session || !req.session.TornAPIKey) {
    try { socket.send(JSON.stringify({ ...base, ok:false, error:'unauthorized' })); } catch {}
    return;
  }
  try {
    const now = Date.now();
    let from = typeof parsed.from === 'number' ? parsed.from : (now - 24*3600*1000);
    let to = typeof parsed.to === 'number' ? parsed.to : now;
    if (from < 10_000_000_000) from *= 1000; // seconds -> ms
    if (to < 10_000_000_000) to *= 1000;
    if (from > to) [from, to] = [to, from];
    const top = (typeof parsed.top === 'number' && parsed.top > 0 && parsed.top <= 50) ? parsed.top : 5;

    const db = fastify.mongo.client.db(req.session.userID.toString());
    const col = db.collection('CompanyStock');

    const docs = await col.find({ timestamp: { $gte: from, $lte: to } }, { projection: { _id:0 } })
      .sort({ timestamp:1 })
      .toArray();

    if (!docs.length) {
      try { socket.send(JSON.stringify({ ...base, ok:true, series:{ totalInStock:[], items:{} }, meta:{ from, to, points:0, top } })); } catch {}
      return;
    }

    // Map: itemName -> [{ t, v, p }]
    const perItem = new Map();
    const totalInStockSeries = [];

    function normalizeSnapshot(doc) {
      // Accept doc.stocks (object|array) or doc.stock (object|array)
      const raw = doc.stocks != null ? doc.stocks : doc.stock;
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.map((v,i)=>({
          ...v,
            name: v?.name || v?.item || v?.item_name || `item_${i}`
        }));
      }
      if (typeof raw === 'object') {
        return Object.entries(raw).map(([k,v],i)=>({
          ...v,
          name: v?.name || v?.item || v?.item_name || k || `item_${i}`
        }));
      }
      return [];
    }

    for (const d of docs) {
      const t = d.timestamp;
      const items = normalizeSnapshot(d);
      let sum = 0;
      for (const it of items) {
        if (!it) continue;
        const name = it.name || 'Unknown';
        const inStock = Number(it.in_stock) || 0;
        const price = Number(it.price) || 0;
        sum += inStock;
        if (!perItem.has(name)) perItem.set(name, []);
        perItem.get(name).push({ t, v: inStock, p: price });
      }
      totalInStockSeries.push({ t, v: sum });
    }

    // Déterminer le ranking à partir du dernier snapshot
    const latest = docs[docs.length - 1];
    const latestItems = latest ? normalizeSnapshot(latest) : [];
    let ranking = latestItems
      .map(it => ({ name: it.name, in_stock: Number(it.in_stock)||0 }))
      .sort((a,b)=> b.in_stock - a.in_stock)
      .slice(0, top)
      .map(r => r.name);

    if (!ranking.length) {
      // fallback: top par nombre de points
      ranking = Array.from(perItem.entries())
        .map(([name, arr]) => ({ name, n: arr.length }))
        .sort((a,b)=> b.n - a.n)
        .slice(0, top)
        .map(r => r.name);
    }

    const itemsSeries = {};
    for (const name of ranking) {
      itemsSeries[name] = (perItem.get(name) || []).map(o => ({ t:o.t, v:o.v, p:o.p }));
    }

    const payload = {
      ...base,
      ok: true,
      series: {
        totalInStock: totalInStockSeries,
        items: itemsSeries
      },
      meta: { from, to, points: docs.length, top, items: ranking.length }
    };
    try { socket.send(JSON.stringify(payload)); } catch {}
  } catch (e) {
    try { socket.send(JSON.stringify({ ...base, ok:false, error:e.message })); } catch {}
  }
};
