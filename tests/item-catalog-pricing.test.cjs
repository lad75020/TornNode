'use strict';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  assert,
  createSocket,
} = require('./helpers/tornSyncTestHarness.cjs');
const wsGetAllTornItems = require('../ws/wsGetAllTornItems.cjs');
const wsUpdatePrice = require('../ws/wsUpdatePrice.cjs');
const { SAFE_ERRORS } = require('../utils/tornSyncHelpers.cjs');

function session(userId = 7, apiKey = 'test-api-key') {
  return { userId, TornAPIKey: apiKey };
}

function makeCatalogCollection(initial = [], { failUpdate = false } = {}) {
  const docs = initial.map(item => ({ ...item }));
  return {
    docs,
    find(_filter = {}, _options = {}) {
      return { toArray: async () => docs.map(item => ({ ...item })) };
    },
    async findOne(filter = {}) {
      return docs.find(item => Number(item.id) === Number(filter.id)) || null;
    },
    async updateOne(filter, update) {
      if (failUpdate) throw new Error('database write failed');
      const item = docs.find(candidate => Number(candidate.id) === Number(filter.id));
      if (!item) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      Object.assign(item, update && update.$set ? update.$set : {});
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
  };
}

function makeRedis(initial = {}) {
  const values = new Map();
  for (const [key, value] of Object.entries(initial)) {
    values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const expirations = new Map();
  const variationLog = [];

  async function sendCommand(command) {
    const [name, key, jsonPath, rawValue] = command;
    if (name === 'JSON.GET') return values.get(key) || null;
    if (name === 'JSON.SET') {
      values.set(key, rawValue);
      return 'OK';
    }
    if (name === 'EXPIRE') {
      expirations.set(key, Number(jsonPath));
      return 1;
    }
    return null;
  }

  return {
    values,
    expirations,
    variationLog,
    async scan() { return ['0', [...values.keys()]]; },
    multi() {
      const commands = [];
      return {
        addCommand(command) { commands.push(command); },
        async exec() {
          const results = [];
          for (const command of commands) results.push(await sendCommand(command));
          return results;
        },
      };
    },
    sendCommand,
    async expire(key, seconds) {
      expirations.set(key, Number(seconds));
      return 1;
    },
    async rPush(key, value) {
      variationLog.push({ key, value });
      return variationLog.length;
    },
    async ttl() { return -1; },
  };
}

function makeFastify(collection, redis) {
  return {
    redis,
    mongo: {
      db(name) {
        assert.equal(name, 'TORN');
        return { collection: () => collection };
      },
    },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
}

async function withoutGlobalApiKey(callback) {
  const previous = process.env.TORN_API_KEY;
  delete process.env.TORN_API_KEY;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.TORN_API_KEY;
    else process.env.TORN_API_KEY = previous;
  }
}

test('valid supplied price persists the item and returns a finite success', async () => {
  const item = { id: 1, name: 'Medkit', price: 100, img64: '', description: 'desc' };
  const collection = makeCatalogCollection([item]);
  const redis = makeRedis();
  const socket = createSocket();

  await wsUpdatePrice(
    socket,
    { session: session() },
    makeFastify(collection, redis),
    { type: 'updatePrice', id: 1, price: 275 },
    redis,
  );

  assert.deepEqual(socket.frames.at(-1), {
    type: 'updatePrice',
    ok: true,
    id: 1,
    price: 275,
    cache: 'json',
  });
  assert.equal(collection.docs[0].price, 275);
  assert.equal(redis.expirations.get('tornItems:v2:1'), 86400);
});

test('malformed identifiers are rejected with the safe price error', async () => {
  const collection = makeCatalogCollection([{ id: 1, name: 'Medkit', price: 100 }]);
  const redis = makeRedis();
  const socket = createSocket();

  await wsUpdatePrice(
    socket,
    { session: session() },
    makeFastify(collection, redis),
    { type: 'updatePrice', id: '1abc', price: 275 },
    redis,
  );

  assert.deepEqual(socket.frames.at(-1), {
    type: 'updatePrice',
    ok: false,
    error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
  });
  assert.equal(collection.docs[0].price, 100);
});

test('invalid supplied prices do not fall through to an unsafe market lookup', async () => {
  await withoutGlobalApiKey(async () => {
    const collection = makeCatalogCollection([{ id: 1, name: 'Medkit', price: 100 }]);
    const redis = makeRedis();
    const socket = createSocket();

    await wsUpdatePrice(
      socket,
      { session: session() },
      makeFastify(collection, redis),
      { type: 'updatePrice', id: 1, price: -1 },
      redis,
    );

    assert.deepEqual(socket.frames.at(-1), {
      type: 'updatePrice',
      ok: false,
      error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
    });
    assert.equal(collection.docs[0].price, 100);
  });
});

test('a missing target item cannot produce a phantom successful price update', async () => {
  const collection = makeCatalogCollection([]);
  const redis = makeRedis();
  const socket = createSocket();

  await wsUpdatePrice(
    socket,
    { session: session() },
    makeFastify(collection, redis),
    { type: 'updatePrice', id: 404, price: 275 },
    redis,
  );

  assert.deepEqual(socket.frames.at(-1), {
    type: 'updatePrice',
    ok: false,
    error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
  });
  assert.equal(redis.values.has('tornItems:v2:404'), false);
});

test('persistence failures return a safe error and preserve the durable price', async () => {
  const collection = makeCatalogCollection(
    [{ id: 1, name: 'Medkit', price: 100 }],
    { failUpdate: true },
  );
  const redis = makeRedis();
  const socket = createSocket();

  await wsUpdatePrice(
    socket,
    { session: session() },
    makeFastify(collection, redis),
    { type: 'updatePrice', id: 1, price: 275 },
    redis,
  );

  assert.deepEqual(socket.frames.at(-1), {
    type: 'updatePrice',
    ok: false,
    error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
  });
  assert.equal(collection.docs[0].price, 100);
});

test('complete cache records are served to authenticated clients', async () => {
  const item = { id: 1, name: 'Medkit', price: 100, img64: '', description: 'desc' };
  const redis = makeRedis({ 'tornItems:v2:1': item });
  const socket = createSocket();

  await wsGetAllTornItems(socket, { session: session() }, makeFastify(makeCatalogCollection([]), redis));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getAllTornItems',
    ok: true,
    items: [item],
  });
});

test('malformed cached identifiers fall back to a validated authoritative catalog', async () => {
  const item = { id: 1, name: 'Medkit', price: 100, img64: '', description: 'desc' };
  const redis = makeRedis({
    'tornItems:v2:1': { ...item, id: 'not-an-id' },
  });
  const socket = createSocket();

  await wsGetAllTornItems(socket, { session: session() }, makeFastify(makeCatalogCollection([item]), redis));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getAllTornItems',
    ok: true,
    items: [item],
  });
});

test('negative authoritative prices are rejected instead of published', async () => {
  const invalid = { id: 1, name: 'Medkit', price: -1, img64: '', description: 'desc' };
  const redis = makeRedis();
  const socket = createSocket();

  await wsGetAllTornItems(socket, { session: session() }, makeFastify(makeCatalogCollection([invalid]), redis));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getAllTornItems',
    ok: false,
    error: SAFE_ERRORS.ITEM_CATALOG_FAILED,
  });
});

test('an empty authoritative catalog returns a safe failure', async () => {
  const redis = makeRedis();
  const socket = createSocket();

  await wsGetAllTornItems(socket, { session: session() }, makeFastify(makeCatalogCollection([]), redis));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getAllTornItems',
    ok: false,
    error: SAFE_ERRORS.ITEM_CATALOG_FAILED,
  });
});

test('unauthenticated catalog and price requests return safe failures', async () => {
  const collection = makeCatalogCollection([{ id: 1, name: 'Medkit', price: 100, img64: '', description: 'desc' }]);
  const redis = makeRedis();
  const catalogSocket = createSocket();
  const priceSocket = createSocket();
  const fastify = makeFastify(collection, redis);

  await wsGetAllTornItems(catalogSocket, {}, fastify);
  await wsUpdatePrice(priceSocket, {}, fastify, { type: 'updatePrice', id: 1, price: 275 }, redis);

  assert.deepEqual(catalogSocket.frames.at(-1), {
    type: 'getAllTornItems',
    ok: false,
    error: SAFE_ERRORS.ITEM_CATALOG_FAILED,
  });
  assert.deepEqual(priceSocket.frames.at(-1), {
    type: 'updatePrice',
    ok: false,
    error: SAFE_ERRORS.ITEM_PRICE_UPDATE_FAILED,
  });
  assert.equal(collection.docs[0].price, 100);
});

test('client catalog lifecycle exposes shared freshness, retention, and safe-update policies', () => {
  const root = path.join(__dirname, '..');
  const syncSource = fs.readFileSync(path.join(root, 'client/src/syncItemsToIndexedDB.js'), 'utf8');
  const mainSource = fs.readFileSync(path.join(root, 'client/src/main.jsx'), 'utf8');
  const autocompleteSource = fs.readFileSync(path.join(root, 'client/src/Autocomplete.jsx'), 'utf8');
  const typeSource = fs.readFileSync(path.join(root, 'client/src/ItemsTypeDropdown.jsx'), 'utf8');
  const priceSource = fs.readFileSync(path.join(root, 'client/src/UpdatePrice.jsx'), 'utf8');

  assert.match(syncSource, /export const ITEMS_SYNC_MAX_AGE_MS/);
  assert.match(syncSource, /export function isItemsCatalogStale/);
  assert.match(syncSource, /await tx\.done/);
  assert.match(syncSource, /restoreItems\(db, previousItems\)/);
  assert.doesNotMatch(mainSource, /setInterval\(requestItems, 5 \* 60 \* 1000\)/);
  assert.match(autocompleteSource, /catalogRequestRef/);
  assert.match(autocompleteSource, /window\.addEventListener\('storage'/);
  assert.match(autocompleteSource, /validItems\.length === 0/);
  assert.match(autocompleteSource, /safeServerError/);
  assert.match(typeSource, /localeCompare/);
  assert.match(typeSource, /Never replace known-good options/);
  assert.match(priceSource, /normalizeItemId/);
  assert.match(priceSource, /!isCompleteItem\(candidate\)/);
});
