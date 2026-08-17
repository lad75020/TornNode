'use strict';

const test = require('node:test');
const {
  assert,
  createSocket,
  createCollection,
  createUserDatabase,
  createFastifyForUserDatabases,
  framesOf,
} = require('./helpers/tornSyncTestHarness.cjs');
const getUserDb = require('../utils/getUserDb.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const wsTorn = require('../ws/wsTorn.cjs');
const wsTornAttacks = require('../ws/wsTornAttacks.cjs');
const wsGetAllTornLogs = require('../ws/wsGetAllTornLogs.cjs');
const wsGetTornAttacks = require('../ws/wsGetTornAttacks.cjs');
const wsGetAllTornItems = require('../ws/wsGetAllTornItems.cjs');

function session(userId, apiKey = 'server-only-key') {
  return { userId, TornAPIKey: apiKey };
}

function importClient(logResponse, attackResponse) {
  return {
    user: {
      async log() { return typeof logResponse === 'function' ? logResponse() : logResponse; },
      async attacks() { return typeof attackResponse === 'function' ? attackResponse() : attackResponse; },
    },
  };
}

test('getUserDb uses only the authenticated session tenant', () => {
  const db = {};
  const fastify = { mongo: { db(name) { assert.equal(name, '42'); return db; } } };
  assert.equal(getUserDb(fastify, { session: session(42), body: { userId: 99 } }), db);
  assert.throws(() => getUserDb(fastify, { session: { userId: 99.5 } }), /invalid authenticated user/);
  assert.throws(() => getUserDb(fastify, { session: { userId: 0 } }), /invalid authenticated user/);
});

test('ensureUserDbStructure creates required collections/indexes idempotently', async () => {
  ensureUserDbStructure.clearCache();
  const database = createUserDatabase();
  const fastify = createFastifyForUserDatabases({ '7': database });
  const first = await ensureUserDbStructure(fastify, 7, fastify.log);
  const second = await ensureUserDbStructure(fastify, 7, fastify.log);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.ok(database.collection('logs').indexes.length >= 2);
  assert.ok(database.collection('attacks').indexes.some(index => index.spec.code === 1));
});

test('log import is resumable, bounded, progress-reporting, and duplicate-safe', async () => {
  const database = createUserDatabase();
  const socket = createSocket();
  let calls = 0;
  const client = importClient(() => {
    calls += 1;
    return { log: { source: { id: 'source', timestamp: 100, details: { id: 7, title: 'Activity', category: 'x' } } } };
  });
  const req = { session: session(42) };
  const fastify = { log: { warn() {}, info() {} } };

  await wsTorn(socket, req, fastify, { database, tornClient: client, from: 100, to: 100, segmentDelayMs: 0 });
  assert.equal(calls, 1);
  assert.equal(database.collection('logs').docs.length, 1);
  assert.equal(framesOf(socket, 'importedData').at(-1).logsImported, 1);
  assert.equal(framesOf(socket, 'importProgress').at(-1).percent, 100);
  assert.equal(socket.__importingLogs, false);

  await wsTorn(socket, req, fastify, { database, tornClient: client, from: 100, to: 100, segmentDelayMs: 0 });
  assert.equal(database.collection('logs').docs.length, 1);
  assert.equal(framesOf(socket, 'importedData').at(-1).logsImported, 0);
});

test('log import retries a rate-limited window and preserves committed records', async () => {
  const database = createUserDatabase();
  const socket = createSocket();
  let calls = 0;
  const client = importClient(() => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('rate limited');
      error.code = 429;
      throw error;
    }
    return { log: { source: { id: 'retry-source', timestamp: 100 } } };
  });
  await wsTorn(socket, { session: session(43) }, { log: { warn() {}, info() {} } }, {
    database,
    tornClient: client,
    from: 100,
    to: 100,
    retryDelayMs: 0,
    maxAttempts: 2,
    segmentDelayMs: 0,
  });
  assert.equal(calls, 2);
  assert.equal(database.collection('logs').docs.length, 1);
  assert.equal(framesOf(socket, 'importedData').at(-1).logsImported, 1);
});

test('attack import deduplicates stable attack codes and emits terminal progress', async () => {
  const database = createUserDatabase();
  const socket = createSocket();
  const client = importClient(null, { attacks: { attack: { code: 'attack-1', started: 100, ended: 101, result: 'Won', attacker: { id: 44 } } } });
  const req = { session: session(44) };
  const fastify = { log: { warn() {}, info() {} } };
  await wsTornAttacks(socket, req, fastify, { database, tornClient: client, from: 100, to: 101, segmentDelayMs: 0 });
  await wsTornAttacks(socket, req, fastify, { database, tornClient: client, from: 100, to: 101, segmentDelayMs: 0 });
  assert.equal(database.collection('attacks').docs.length, 1);
  assert.equal(framesOf(socket, 'importedData').at(-1).attacksImported, 0);
  assert.equal(framesOf(socket, 'importProgress').at(-1).percent, 100);
});

test('direct private handlers fail closed without a usable session', async () => {
  const socket = createSocket();
  const fastify = {
    mongo: { db() { throw new Error('must not select a user database'); } },
    log: { warn() {} },
  };
  await wsTorn(socket, { session: { TornAPIKey: 'secret' } }, fastify, { from: 1, to: 1 });
  await wsGetAllTornLogs(socket, { session: { TornAPIKey: 'secret' } }, fastify, { from: 1, to: 1, requestId: 'x' });
  await wsGetAllTornItems(socket, { session: {} }, fastify, {});
  assert.ok(socket.frames.every(frame => frame.error));
});

test('stored log retrieval is request-correlated, chronological, and tenant-scoped', async () => {
  const userOne = createUserDatabase({ logs: [
    { _id: 2, timestamp: 102, log: 9, title: 'later' },
    { _id: 1, timestamp: 101, log: 9, title: 'earlier' },
  ] });
  const userTwo = createUserDatabase({ logs: [{ _id: 3, timestamp: 101, log: 9, title: 'other user' }] });
  const fastify = createFastifyForUserDatabases({ '1': userOne, '2': userTwo });
  ensureUserDbStructure.clearCache();
  const socket = createSocket();
  await wsGetAllTornLogs(socket, { session: session(1) }, fastify, { from: 100, to: 103, batchSize: 50, requestId: 'request-1', userId: 2 });
  const batch = framesOf(socket, 'getAllTornLogs').find(frame => frame.phase === 'batch');
  assert.deepEqual(batch.batch.map(item => item.title), ['earlier', 'later']);
  assert.equal(batch.requestId, 'request-1');
  assert.equal(framesOf(socket, 'getAllTornLogs').at(-1).phase, 'end');
});

test('attack aggregates read only the authenticated user store', async () => {
  const userOne = createUserDatabase({ attacks: [
    { code: 'a', started: 100, attacker: { id: 1 }, result: 'Won' },
    { code: 'b', started: 101, attacker: { id: 99 }, result: 'Lost' },
  ] });
  const userTwo = createUserDatabase({ attacks: [{ code: 'other', started: 100, attacker: { id: 1 }, result: 'Lost' }] });
  const fastify = createFastifyForUserDatabases({ '1': userOne, '2': userTwo });
  ensureUserDbStructure.clearCache();
  const socket = createSocket();
  await wsGetTornAttacks(socket, { session: session(1) }, fastify, { from: 100, to: 101, userId: 2 });
  assert.deepEqual(socket.frames.at(-1), { type: 'getTornAttacks', from: 100, to: 101, wins: 2, losses: 0, attacks: 1, defends: 1 });
});

function createRedis(items) {
  const values = new Map(Object.entries(items).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    async scan() { return ['0', [...values.keys()]]; },
    multi() {
      const commands = [];
      return {
        addCommand(command) { commands.push(command); },
        async exec() {
          return commands.map(command => command[0] === 'JSON.GET' ? values.get(command[1]) || null : 'OK');
        },
      };
    },
    async sendCommand(command) { return values.get(command[1]) || null; },
  };
}

test('item retrieval accepts a complete cache and falls back from incomplete cache', async () => {
  const item = { id: 1, name: 'Item', price: 0, img64: '', description: 'desc' };
  const cachedSocket = createSocket();
  await wsGetAllTornItems(cachedSocket, { session: session(1) }, { redis: createRedis({ 'tornItems:v2:1': item }), log: { warn() {}, debug() {} } });
  assert.equal(cachedSocket.frames.at(-1).ok, true);
  assert.equal(cachedSocket.frames.at(-1).items[0].id, 1);

  const fallbackSocket = createSocket();
  const catalog = createCollection('Items', [item]);
  const fastify = {
    redis: createRedis({ 'tornItems:v2:1': { ...item, description: undefined } }),
    mongo: { db(name) { assert.equal(name, 'TORN'); return { collection() { return catalog; } }; } },
    log: { warn() {}, debug() {} },
  };
  await wsGetAllTornItems(fallbackSocket, { session: session(2) }, fastify);
  assert.equal(fallbackSocket.frames.at(-1).ok, true);
  assert.deepEqual(fallbackSocket.frames.at(-1).items, [item]);
});

test('duplicate starts are rejected and in-flight stop requests end at a safe point', async () => {
  const duplicateSocket = createSocket();
  duplicateSocket.__importingLogs = true;
  await wsTorn(duplicateSocket, { session: session(50) }, { log: { warn() {} } }, { from: 1, to: 1, database: createUserDatabase() });
  assert.deepEqual(duplicateSocket.frames.at(-1), { type: 'importProgress', kind: 'logs', error: 'already_running', phase: 'rejected' });

  const database = createUserDatabase();
  const stopSocket = createSocket();
  const client = {
    user: {
      async log() {
        stopSocket.__stopImport.logs = true;
        return { log: { source: { id: 'committed-before-stop', timestamp: 100 } } };
      },
    },
  };
  await wsTorn(stopSocket, { session: session(51) }, { log: { warn() {}, info() {} } }, {
    database,
    tornClient: client,
    from: 100,
    to: 100,
    segmentDelayMs: 0,
  });
  assert.equal(database.collection('logs').docs.length, 1);
  assert.equal(framesOf(stopSocket, 'importStopped').length, 1);
  assert.equal(framesOf(stopSocket, 'importedData').length, 0);
  assert.equal(stopSocket.__importingLogs, false);
});

test('router-managed imports release guards when the session expires before dispatch', async () => {
  const logsSocket = createSocket();
  const attacksSocket = createSocket();
  logsSocket.__importingLogs = true;
  attacksSocket.__importingAttacks = true;

  await wsTorn(logsSocket, { session: {} }, {}, { managedByRouter: true });
  await wsTornAttacks(attacksSocket, { session: {} }, {}, { managedByRouter: true });

  assert.equal(logsSocket.__importingLogs, false);
  assert.equal(attacksSocket.__importingAttacks, false);
  assert.equal(logsSocket.__stopImport?.logs, undefined);
  assert.equal(attacksSocket.__stopImport?.attacks, undefined);
});
