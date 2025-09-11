#!/usr/bin/env node
// Chargement simple: .env situé exactement un répertoire au‑dessus de ce script
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });
/*
 * Script: fetchNewItems.js
 * But: Interroger l'API TORN (endpoint market/{id}?selections=itemmarket&key=API_KEY) pour découvrir
 *       de nouveaux items au‑delà du plus grand id présent dans MongoDB (collection Items).
 * Logique:
 *   1. Connexion Mongo.
 *   2. Trouver l'id max existant.
 *   3. Incrémenter id et appeler l'API jusqu'à ce qu'une réponse contienne un champ error => arrêt.
 *   4. Si pas d'erreur: insérer (si non présent) un document Items minimal { id, discoveredAt, raw, name?, price? }.
 *   5. Pause courte entre requêtes pour respecter limites (configurable via --delay ms).
 *
 * Usage:
 *   node scripts/fetchNewItems.js --mongo "mongodb://localhost:27017" --db TORN --key YOUR_API_KEY \
 *        [--startId 5000] [--delay 800] [--max 500]
 *
 * Notes:
 *   - Si --startId est fourni, on commence à cet id (sinon max+1).
 *   - --max limite le nombre de tentatives (sécurité) même sans erreur.
 *   - Le script s'arrête sur la première erreur API rencontrée après avoir tenté au moins 1 nouvelle insertion.
 */

const { MongoClient } = require('mongodb');
const yargs = require('yargs');

(async () => {
  const argv = yargs
    .option('mongo', { type: 'string', default: "mongodb://localhost:27017",demandOption: true, describe: 'URL MongoDB (ex: mongodb://localhost:27017)' })
    .option('db', { type: 'string', default: 'TORN', describe: 'Nom base de données' })
  .option('key', { type: 'string', describe: 'TORN API KEY (sinon TORN_API_KEY env)' })
    .option('apiBase', { type: 'string', default: process.env.TORN_API_URL || 'https://api.torn.com/V2', describe: 'Base URL API' })
    .option('delay', { type: 'number', default: 2000, describe: 'Délai ms entre requêtes' })
    .option('max', { type: 'number', default: 100, describe: 'Nombre max de IDs à tester' })
    .option('startId', { type: 'number', describe: 'Forcer un id de départ (sinon max existant + 1)' })
    .help().argv;

  const { mongo, db: dbName, key: keyOpt, apiBase, delay, max, startId } = argv;
  const key = keyOpt || process.env.TORN_API_KEY;
  if (!key) {
    console.error('[fetchNewItems] Aucune clé API fournie (--key) ni variable env TORN_API_KEY. Abort.');
    process.exit(1);
  }
  const client = new MongoClient(mongo, { compressors: ['snappy'] });
  await client.connect();
  const db = client.db(dbName);
  const items = db.collection('Items');

  const maxDoc = await items.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
  const currentMax = maxDoc.length ? maxDoc[0].id : 0;
  let id = startId && startId > 0 ? startId : currentMax + 1;

  console.log(`[fetchNewItems] Max id existant: ${currentMax}. Début à id=${id}`);

  let attempts = 0;
  let inserted = 0;
  let graceMode = false; // activé après première erreur
  let graceRemaining = 0; // nombre d'IDs supplémentaires à tester

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  while (attempts < max) {
    attempts++;
  const url = `${apiBase.replace(/\/$/, '')}/market/${id}?selections=itemmarket&key=${encodeURIComponent(key)}`;
    let json;
    try {
      const res = await fetch(url);
      const text = await res.text();
      try { json = JSON.parse(text); } catch { console.error(`[fetchNewItems] JSON parse fail id=${id}`); break; }
    } catch (e) {
      console.error(`[fetchNewItems] Fetch erreur id=${id}: ${e.message}`);
      break;
    }

    if (json && json.error) {
      if (!graceMode) {
        graceMode = true;
        graceRemaining = 3;
        console.log(`[fetchNewItems] Erreur rencontrée id=${id} code=${json.error.code}. Tentative des ${graceRemaining} IDs suivants avant arrêt.`);
      } else {
        graceRemaining--;
        console.log(`[fetchNewItems] Erreur supplémentaire id=${id} code=${json.error.code}. Reste ${graceRemaining} avant arrêt.`);
      }
      if (graceMode && graceRemaining <= 0) {
        console.log('[fetchNewItems] Fin: seulement des erreurs sur la fenêtre de grâce.');
        break;
      }
      id++;
      await sleep(delay);
      continue; // passer à l'ID suivant sans tenter détails/insertion
    }
    // Si une réponse valide apparaît on réinitialise le mode grâce
    if (graceMode) {
      graceMode = false;
      graceRemaining = 0;
      console.log('[fetchNewItems] Réponse valide après erreurs, reprise normale.');
    }

    // Vérifier si déjà existant
    try {
      const existing = await items.findOne({ id });
      if (existing) {
        console.log(`[fetchNewItems] id=${id} déjà présent (skip)`);
        id++;
        await sleep(delay);
        continue;
      }
    } catch (e) {
      console.error(`[fetchNewItems] Erreur lecture Mongo id=${id}: ${e.message}`);
      break;
    }

    // Second appel API pour détails complets item
    const detailsUrl = `${apiBase.replace(/\/$/, '')}/torn/${id}?selections=items&key=${encodeURIComponent(key)}`;
    let details;
    try {
      const r2 = await fetch(detailsUrl);
      const txt2 = await r2.text();
      try { details = JSON.parse(txt2); } catch { console.error(`[fetchNewItems] JSON parse fail (details) id=${id}`); break; }
    } catch (e) {
      console.error(`[fetchNewItems] Fetch détails erreur id=${id}: ${e.message}`);
      break;
    }
    if (details && details.error) {
      if (!graceMode) {
        graceMode = true; graceRemaining = 3;
        console.log(`[fetchNewItems] Erreur détails id=${id} code=${details.error.code}. Fenêtre grâce ${graceRemaining}.`);
      } else {
        graceRemaining--; console.log(`[fetchNewItems] Erreur détails supplémentaire id=${id}. Reste ${graceRemaining}.`);
      }
      if (graceMode && graceRemaining <= 0) {
        console.log('[fetchNewItems] Fin: erreurs détails consécutives dans la fenêtre de grâce.');
        break;
      }
      id++;
      await sleep(delay);
      continue;
    }
    if (graceMode) { graceMode=false; graceRemaining=0; console.log('[fetchNewItems] Détails valides après erreurs, reprise normale.'); }

    // La structure Torn pour selections=items est souvent { items: { <id>: {...} } }
    let itemObj = null;
    if (details?.items) {
      if (details.items[id]) itemObj = details.items[id];
      else if (details.items.id) itemObj = details.items; // fallback si déjà plat
      else {
        // prendre premier élément plausible
        const first = Object.values(details.items)[0];
        if (first && typeof first === 'object') itemObj = first;
      }
    }
    if (!itemObj) {
      console.log(`[fetchNewItems] Aucun objet item exploitable pour id=${id}, arrêt.`);
      break;
    }

    // Télécharger l'image et convertir en base64
    let img64;
    const imageUrl = itemObj.image;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      try {
        const resImg = await fetch(imageUrl);
        if (resImg.ok) {
          const ab = await resImg.arrayBuffer();
          img64 = Buffer.from(ab).toString('base64');
        } else {
          console.warn(`[fetchNewItems] Image HTTP ${resImg.status} pour id=${id}`);
        }
      } catch (e) {
        console.warn(`[fetchNewItems] Échec téléchargement image id=${id}: ${e.message}`);
      }
    }

    const doc = {
      id: itemObj.id ?? id,
      name: itemObj.name ?? null,
      description: itemObj.description ?? null,
      type: itemObj.type ?? null,
      image: imageUrl ?? null,
      price: itemObj.value?.market_price ?? null,
      img64: img64 || null,
      discoveredAt: new Date()
    };

    try {
      await items.insertOne(doc);
      inserted++;
      console.log(`[fetchNewItems] Nouvel item inséré id=${doc.id} name="${doc.name}"`);
    } catch (e) {
      console.error(`[fetchNewItems] Erreur insertion finale id=${id}: ${e.message}`);
      break;
    }

    id++;
    await sleep(delay);
  }

  console.log(`[fetchNewItems] Terminé. Tentatives=${attempts}, nouveaux insérés=${inserted}. Dernier id tenté=${id-1}`);
  await client.close();
})();
