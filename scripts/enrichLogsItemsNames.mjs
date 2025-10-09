#!/usr/bin/env node
'use strict';

/**
 * Enrich '3305509'.logs documents where log == 9020 by adding an array field 'items_names'
 * resolved from the 'TORN'.Items collection (name by id).
 *
 * Usage:
 *   MONGODB_URI="mongodb://127.0.0.1:27017" node scripts/enrichLogsItemsNames.js [--limit N] [--dry]
 *
 * Defaults:
 *   - MONGODB_URI: mongodb://127.0.0.1:27017
 *   - DB logs: 3305509, collection: logs
 *   - DB items: TORN, collection: Items
 */

import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const LOGS_DB = process.env.LOGS_DB || '3305509';
const LOGS_COLL = process.env.LOGS_COLL || 'logs';
const ITEMS_DB = process.env.ITEMS_DB || 'TORN';
const ITEMS_COLL = process.env.ITEMS_COLL || 'Items';

// Simple argv parsing
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.findIndex(a => a === name || a.startsWith(name + '='));
  if (i === -1) return undefined;
  const v = argv[i].split('=')[1];
  return v === undefined ? true : v;
};
const DRY_RUN = !!arg('--dry');
const LIMIT = arg('--limit') ? Number(arg('--limit')) : null;

function extractItemIds(itemsGained) {
  const ids = new Set();
  if (!itemsGained) return ids;
  if (Array.isArray(itemsGained)) {
    for (const it of itemsGained) {
      const id = Number(it && (it.id != null ? it.id : it.item_id));
      if (Number.isFinite(id)) ids.add(id);
    }
  } else if (typeof itemsGained === 'object') {
    // keys might be item IDs, or values might contain { id }
    for (const [k, v] of Object.entries(itemsGained)) {
      const keyNum = Number(k);
      if (Number.isFinite(keyNum)) { ids.add(keyNum); continue; }
      const id = Number(v && (v.id != null ? v.id : v.item_id));
      if (Number.isFinite(id)) ids.add(id);
    }
  }
  return ids;
}

async function main() {
  const client = new MongoClient(MONGODB_URI, {compressors: ["snappy"]});
  let processed = 0, updated = 0, skipped = 0;
  const started = Date.now();
  try {
    await client.connect();
    const logsDb = client.db(LOGS_DB);
    const itemsDb = client.db(ITEMS_DB);
    const logsCol = logsDb.collection(LOGS_COLL);
    const itemsCol = itemsDb.collection(ITEMS_COLL);

    const filter = { log: 9020 };
    const cursor = logsCol.find(filter, { projection: { _id: 1, 'data.items_gained': 1 } });
    if (LIMIT && Number.isFinite(LIMIT)) cursor.limit(LIMIT);

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      processed++;
      const itemsGained = doc?.data?.items_gained;
      const idSet = extractItemIds(itemsGained);
      if (!idSet.size) { skipped++; continue; }
      const ids = Array.from(idSet);

      const items = await itemsCol
        .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1 } })
        .toArray();
      if (!items.length) { skipped++; continue; }
      const map = new Map(items.map(i => [Number(i.id), String(i.name)]));
      const names = ids.map(id => map.get(id)).filter(Boolean);
      // Deduplicate while preserving order
      const seen = new Set();
      const uniqueNames = names.filter(n => (seen.has(n) ? false : (seen.add(n), true)));

      if (DRY_RUN) {
        console.log(`[dry] would update _id=${doc._id} with items_names=${JSON.stringify(uniqueNames)}`);
      } else {
        const res = await logsCol.updateOne({ _id: doc._id }, { $set: { items_names: uniqueNames } });
        if (res.modifiedCount > 0 || res.upsertedCount > 0 || res.matchedCount > 0) updated++;
      }
    }

    const ms = Date.now() - started;
    console.log(`Done. processed=${processed} updated=${updated} skipped=${skipped} time=${ms}ms`);
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try { await client.close(); } catch {}
  }
}

// In ESM, require is undefined; detect direct execution by comparing argv[1] to this module's URL
const isMain = (() => {
  try {
    const thisPath = fileURLToPath(import.meta.url);
    return process.argv && process.argv[1] && thisPath === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main();
}
