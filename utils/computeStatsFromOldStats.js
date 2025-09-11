#!/usr/bin/env node
/*
  computeStatsFromOldStats.js
  - Script autonome pour lire les documents de OldStats, appliquer un calcul, puis insérer/mettre à jour dans Stats.
  - Le calcul est un placeholder: remplacez la fonction `computeNewStat` par votre logique.

  Exemples d'utilisation:
    node utils/computeStatsFromOldStats.js --db TORN --source OldStats --target Stats --batch-size 500 --upsert
    MONGODB_URI="mongodb://localhost:27017" node utils/computeStatsFromOldStats.js --dry-run

  Variables d'environnement supportées:
    - MONGODB_URI (prioritaire)
    - MONGODB_URI_TEST (fallback)
    - DB_NAME (fallback si --db non fourni)
*/

const { MongoClient } = require('mongodb');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
require('dotenv').config();

const argv = yargs(hideBin(process.argv))
  .option('db', { type: 'string', describe: 'Nom de la base de données', default :'3305509' })
  .option('source', { type: 'string', describe: 'Collection source', default: 'OldStats' })
  .option('target', { type: 'string', describe: 'Collection cible', default: 'Stats' })
  .option('batch-size', { type: 'number', describe: 'Taille de lot pour bulkWrite', default: 500 })
  .option('dry-run', { type: 'boolean', describe: "N'écrit rien en base", default: false })
  .option('upsert', { type: 'boolean', describe: 'Upsert sur la collection cible (idempotent)', default: true })
  .option('query', { type: 'string', describe: 'Filtre JSON pour la source (optionnel)', default: '' })
  .strict()
  .help()
  .alias('h', 'help')
  .parse();

const MONGO_URI = process.env.MONGODB_URI; //process.env.MONGODB_URI
if (!MONGO_URI) {
  console.error('Erreur: MONGODB_URI ou MONGODB_URI_TEST non défini');
  process.exit(1);
}

function safeJsonParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
}

// TODO: Remplacez par votre logique métier
function computeNewStat(oldDoc) {
  if (!oldDoc) return null;
  // Exemple: transformation minimale avec horodatage de calcul
  
  const newDoc = {};
  newDoc._id = oldDoc._id;
  newDoc.date = oldDoc.date;

  const ps = {};
  ps.battle_stats = {strength:oldDoc.personalstats.strength, defense: oldDoc.personalstats.defense, dexterity: oldDoc.personalstats.dexterity, speed: oldDoc.personalstats.speed, total: oldDoc.personalstats.strength + oldDoc.personalstats.defense + oldDoc.personalstats.dexterity + oldDoc.personalstats.speed};
  ps.jobs = {stats : {manual : oldDoc.personalstats.manuallabor , intelligence: oldDoc.personalstats.intelligence, endurance: oldDoc.personalstats.endurance, total: oldDoc.personalstats.manuallabor + oldDoc.personalstats.intelligence + oldDoc.personalstats.endurance}, job_points_used: oldDoc.personalstats.jobpointsused, trains_received: oldDoc.personalstats.trainsreceived};
  ps.hospital = {times_hospitalized: oldDoc.personalstats.hospital, medical_items_used: oldDoc.personalstats.medicalitemsused, blood_withdrawn: oldDoc.personalstats.bloodwithdrawn, reviving : {skill: oldDoc.personalstats.reviveskill, revives:oldDoc.personalstats.revives, revives_received:oldDoc.personalstats.revivesreceived}};
  ps.racing = {skill: oldDoc.personalstats.racingskill, points: oldDoc.personalstats.racingpointsearned};
    newDoc.personalstats = ps;
  //newDoc.networth = {total: oldDoc.personalstats.networth, wallet: oldDoc.personalstats.networthwallet, bank: oldDoc.personalstats.networthbank, stocks: oldDoc.personalstats.stocks, properties: oldDoc.personalstats.properties, vehicles: oldDoc.personalstats.vehicles, business: oldDoc.personalstats.business};
  return newDoc;
}

async function main() {
  const client = new MongoClient(MONGO_URI, { compressors: ['snappy'] });
  const startedAt = Date.now();
  try {
    await client.connect();
    const db = client.db(argv.db);
    const sourceCol = db.collection(argv.source);
    const targetCol = db.collection(argv.target);

    const query = safeJsonParse(argv.query, {});
    const cursor = sourceCol.find();

    let readCount = 0;
    let writeCount = 0;
    let skippedCount = 0;
    let batch = [];

    while (await cursor.hasNext()) {
      const oldDoc = await cursor.next();
      readCount++;
      const newDoc = computeNewStat(oldDoc);
      if (!newDoc) { skippedCount++; continue; }
      const setDoc = { ...newDoc };
      delete setDoc._id; // Pour éviter les conflits si upsert sans _id
      if (argv.upsert) {
        batch.push({
          updateOne: {
            filter: { _id: newDoc._id },
            update: { $set: setDoc },
            upsert: true,
          }
        });
      } else {
        batch.push({ insertOne: { document: newDoc } });
      }

      if (batch.length >= argv['batch-size']) {
        if (!argv['dry-run']) {
          const res = await targetCol.bulkWrite(batch, { ordered: false });
          writeCount += (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.insertedCount || 0);
        }
        batch = [];
        if (readCount % (argv['batch-size'] * 4) === 0) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(`[progress] read=${readCount} written≈${writeCount} skipped=${skippedCount} elapsed=${elapsed}s`);
        }
      }
    }

    if (batch.length) {
      if (!argv['dry-run']) {
        const res = await targetCol.bulkWrite(batch, { ordered: false });
        writeCount += (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.insertedCount || 0);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[done] read=${readCount} written=${writeCount}${argv['dry-run'] ? ' (dry-run)' : ''} skipped=${skippedCount} in ${elapsed}s`);
  } catch (err) {
    console.error('[error]', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try { await client.close(); } catch {}
  }
}

main();
