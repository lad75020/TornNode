#!/usr/bin/env node
'use strict';
/*
 * Script: updateItemsRedisCache.js
 * But: Mettre à jour la variable JSON Redis (clé versionnée) utilisée par wsBazaarPrice.js
 *      avec les items présents dans MongoDB (collection Items) y compris les nouveaux champs
 *      (id, name, price, img64, description...).
 *
 * Fonctionnement:
 *   1. Charge .env (même dossier parent que les autres scripts).
 *   2. Connexion Mongo -> récupère tous les documents Items.
 *   3. Normalise chaque item selon REQUIRED_ITEM_FIELDS (+ garde champs additionnels utiles: type, image).
 *   4. Ecrit dans Redis sous forme JSON via JSON.SET si disponible; sinon fallback en STR (SET).
 *   5. Affiche un résumé (count, taille).
 *
 * Usage:
 *   node scripts/updateItemsRedisCache.js \
 *       --mongo "mongodb://localhost:27017" --db TORN \
 *       --redis redis://localhost:6379 \
 *       [--noJson] (force le fallback string même si JSON.SET dispo) \
 *       [--pretty] (indentation 2)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });

const { MongoClient } = require('mongodb');
const IORedis = require('ioredis');
const yargs = require('yargs');
const { ITEMS_VERSIONED_KEY, REQUIRED_ITEM_FIELDS, ITEM_STRUCT_VERSION } = require('../utils/itemsCacheKey');

(async () => {
  const argv = yargs
    .option('mongo', { type: 'string', default: process.env.MONGO_URL || 'mongodb://localhost:27017', describe: 'URL MongoDB' })
    .option('db', { type: 'string', default: process.env.MONGO_DB || 'TORN', describe: 'Nom base Mongo' })
    .option('redis', { type: 'string', default: process.env.REDIS_URL || 'redis://localhost:6379', describe: 'URL Redis' })
    .option('noJson', { type: 'boolean', default: false, describe: 'Ne pas utiliser RedisJSON même si disponible' })
    .option('pretty', { type: 'boolean', default: false, describe: 'Sortie JSON indentée (fallback string)' })
    .help().argv;

  const { mongo, db: dbName, redis: redisUrl, noJson, pretty } = argv;

  const mongoClient = new MongoClient(mongo, { compressors: ['snappy'] });
  await mongoClient.connect();
  const db = mongoClient.db(dbName);
  const itemsCol = db.collection('Items');

  console.log(`[updateItemsRedisCache] Lecture des items depuis Mongo (${dbName})...`);
  const rawItems = await itemsCol.find({}, { projection: { _id:0 } }).toArray();
  console.log(`[updateItemsRedisCache] Items récupérés: ${rawItems.length}`);

  // Normalisation (assurer tous champs requis + conserver extras pertinents)
  const normalized = rawItems.map(it => {
    const obj = {};
    for (const f of REQUIRED_ITEM_FIELDS) obj[f] = it[f] !== undefined ? it[f] : null;
    // Champs additionnels fréquents
    if (it.type !== undefined) obj.type = it.type;
    if (it.image !== undefined) obj.image = it.image;
    if (it.value !== undefined) obj.value = it.value; // éventuel objet valeur original
    return obj;
  }).sort((a,b) => a.id - b.id);

  const redis = new IORedis(redisUrl);
  redis.on('error', e => console.error('[updateItemsRedisCache] Redis error', e));

  // Détection support RedisJSON via commande INFO MODULES (ou JSON.GET test)
  let redisJsonAvailable = false;
  if (!noJson) {
    try {
      // Tentative simple: JSON.GET sur une clé inexistante
      await redis.call('JSON.GET', '__nonexistent__');
    } catch (e) {
      if (/unknown command|ERR unknown command/i.test(e.message)) {
        redisJsonAvailable = false;
      } else if (/ERR JSON path does not exist/i.test(e.message)) {
        // Module présent
        redisJsonAvailable = true;
      } else {
        // Autre erreur: considérer module peut-être présent
        redisJsonAvailable = true;
      }
    }
  }

  // Utiliser un index objet id->item pour permettre des mises à jour partielles rapides via JSON.SET $."id"
  const indexObj = normalized.reduce((acc, it) => { acc[it.id] = it; return acc; }, {});
  const jsonStr = JSON.stringify(indexObj, pretty ? 2 : 0);

  if (redisJsonAvailable && !noJson) {
    try {
  await redis.call('JSON.SET', ITEMS_VERSIONED_KEY, '$', jsonStr);
      console.log(`[updateItemsRedisCache] JSON.SET OK -> clé ${ITEMS_VERSIONED_KEY} (items=${normalized.length}, version=${ITEM_STRUCT_VERSION})`);
    } catch (e) {
      console.warn('[updateItemsRedisCache] JSON.SET échec, fallback SET. Raison: '+e.message);
      await redis.set(ITEMS_VERSIONED_KEY, jsonStr);
      console.log(`[updateItemsRedisCache] SET OK -> clé ${ITEMS_VERSIONED_KEY} (fallback)`);
    }
  } else {
    await redis.set(ITEMS_VERSIONED_KEY, jsonStr);
    console.log(`[updateItemsRedisCache] SET OK -> clé ${ITEMS_VERSIONED_KEY} (items=${normalized.length}, version=${ITEM_STRUCT_VERSION})`);
  }

  // Stat rapide sur taille
  console.log(`[updateItemsRedisCache] Taille JSON ~${(Buffer.byteLength(jsonStr)/1024).toFixed(1)} KiB`);

  await redis.quit();
  await mongoClient.close();
  console.log('[updateItemsRedisCache] Terminé.');
})().catch(e => { console.error('[updateItemsRedisCache] Fatal:', e); process.exit(1); });
