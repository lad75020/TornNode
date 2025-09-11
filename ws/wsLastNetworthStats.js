// wsLastNetworthStats.js
// Envoie via websocket le dernier document (par date) de la collection Stats
// avec uniquement certains champs personalstats.* networth.

module.exports = async function (socket, req, client) {
  try {
    const getUserDb = require('../utils/getUserDb');
    let coll;
    try {
      const ensureUserDbStructure = require('../utils/ensureUserDbStructure');
      await ensureUserDbStructure(client, req.session.userID, null);
      const db = getUserDb(client, req);
      coll = db.collection('Stats');
    } catch(e){
      try { socket.send(JSON.stringify({ type:'lastNetworth', error: e.message })); } catch(_){ }
      return;
    }

    // Trouver le dernier document par date (assumant champ date stocké en Date)
  const doc = await coll.findOne({}, {
      projection: {
        date: 1,
        'personalstats.networth': 1
      },
      sort: { date: -1 },
      limit: 1
    });

  if (!doc || !doc.personalstats || !doc.personalstats.networth) {
      try { socket.send(JSON.stringify({ type: 'lastNetworth', error: 'No Stats document found' })); } catch(_) {}
      return;
    }

      const payload = {
        type: 'lastNetworth',
        date: doc.date,
        networth :{
      networthwallet: doc.personalstats.networth.wallet ?? 0,
      networthvault:  doc.personalstats.networth.vaults ?? 0,
      networthbank: doc.personalstats.networth.bank ?? 0,
      networthcayman: doc.personalstats.networth.overseas_bank ?? 0,
      networthpoints: doc.personalstats.networth.points ?? 0,
      networthitems: doc.personalstats.networth.inventory ?? 0,
      networthdisplaycase: doc.personalstats.networth.displaycase ?? 0,
      networthbazaar: doc.personalstats.networth.bazaar ?? 0,
      networthitemmarket: doc.personalstats.networth.item_market ?? 0,
      networthproperties: doc.personalstats.networth.property ?? 0,
      networthstockmarket: doc.personalstats.networth.stock_market ?? 0,
      networthauctionhouse: doc.personalstats.networth.auction_house ?? 0,
      networthbookie: doc.personalstats.networth.bookie ?? 0,
      networthcompany: doc.personalstats.networth.company ?? 0,
      networthenlistedcars: doc.personalstats.networth.enlisted_cars ?? 0,
      networthpiggybank: doc.personalstats.networth.piggy_bank ?? 0,
      networthpending: doc.personalstats.networth.pending ?? 0
        }
      };


    try { socket.send(JSON.stringify(payload)); } catch(_) {}
  } catch (e) {
    try { socket.send(JSON.stringify({ type: 'lastNetworth', error: e.message })); } catch(_) {}
  }
};
