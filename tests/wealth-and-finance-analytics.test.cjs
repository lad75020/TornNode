'use strict';

const test = require('node:test');
const {
  assert,
  createSocket,
  createUserDatabase,
  createFastifyForUserDatabases,
} = require('./helpers/tornSyncTestHarness.cjs');
const wsGetNetworth = require('../ws/wsGetNetworth.cjs');
const wsLastNetworthStats = require('../ws/wsLastNetworthStats.cjs');
const wsInsertNetworth = require('../ws/wsInsertNetworth.cjs');

function session(userId, apiKey = 'server-only-key') {
  return { userId, TornAPIKey: apiKey };
}

function fastifyFor(database) {
  return createFastifyForUserDatabases({ '7': database, '8': createUserDatabase() });
}

test('getNetworth is tenant-scoped, finite, projected, and chronologically ordered', async () => {
  const database = createUserDatabase({
    Networth: [
      { _id: 'hidden-2', date: new Date('2026-08-02T00:00:00Z'), value: 200, secret: 'hidden' },
      { _id: 'hidden-1', date: new Date('2026-08-01T00:00:00Z'), money: { daily_networth: '100' }, secret: 'hidden' },
      { _id: 'invalid-date', date: 'not-a-date', value: 999 },
      { _id: 'invalid-value', date: new Date('2026-08-03T00:00:00Z'), value: 'not-a-number' },
    ],
  });
  const socket = createSocket();

  await wsGetNetworth(socket, { session: session(7) }, fastifyFor(database));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getNetworth',
    data: [
      { date: '2026-08-01T00:00:00.000Z', value: 100 },
      { date: '2026-08-02T00:00:00.000Z', value: 200 },
    ],
  });
  assert.equal(JSON.stringify(socket.frames.at(-1)).includes('hidden'), false);

  const invalidSession = createSocket();
  await wsGetNetworth(invalidSession, { session: {} }, fastifyFor(database));
  assert.deepEqual(invalidSession.frames.at(-1), {
    type: 'getNetworth',
    error: 'Invalid session',
  });
});

test('getNetworth hides database failures', async () => {
  const database = createUserDatabase();
  database.collection('Networth').find = () => {
    throw new Error('database internals');
  };
  const socket = createSocket();

  await wsGetNetworth(socket, { session: session(7) }, fastifyFor(database));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getNetworth',
    error: 'Networth could not be loaded. Please retry.',
  });
});

test('lastNetworth allow-lists finite breakdown values and preserves date', async () => {
  const database = createUserDatabase({
    Stats: [
      {
        _id: 'hidden',
        date: new Date('2026-08-01T00:00:00Z'),
        personalstats: {
          networth: {
            wallet: 100,
            bank: '250',
            vaults: 'not-a-number',
            secret: 123,
          },
        },
      },
    ],
  });
  const socket = createSocket();

  await wsLastNetworthStats(socket, { session: session(7) }, fastifyFor(database));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'lastNetworth',
    date: '2026-08-01T00:00:00.000Z',
    networth: {
      networthwallet: 100,
      networthbank: 250,
    },
  });
  assert.equal(JSON.stringify(socket.frames.at(-1)).includes('secret'), false);
});

test('lastNetworth returns a safe error for invalid sessions and database failures', async () => {
  const invalidSocket = createSocket();
  await wsLastNetworthStats(invalidSocket, { session: {} }, fastifyFor(createUserDatabase()));
  assert.deepEqual(invalidSocket.frames.at(-1), {
    type: 'lastNetworth',
    error: 'Invalid session',
  });

  const database = createUserDatabase();
  database.collection('Stats').findOne = async () => {
    throw new Error('stats internals');
  };
  const failedSocket = createSocket();
  await wsLastNetworthStats(failedSocket, { session: session(7) }, fastifyFor(database));
  assert.deepEqual(failedSocket.frames.at(-1), {
    type: 'lastNetworth',
    error: 'Latest networth could not be loaded. Please retry.',
  });
});

test('networth insertion rejects invalid sessions without leaking credentials', async () => {
  const socket = createSocket();
  await wsInsertNetworth({ session: { userId: 7 } }, { log: { warn() {}, error() {} } }, socket);

  assert.deepEqual(socket.frames.at(-1), {
    type: 'networthInsert',
    ok: false,
    inserted: false,
    error: 'Invalid session',
    time: socket.frames.at(-1).time,
  });
  assert.equal('TornAPIKey' in socket.frames.at(-1), false);
});

test('networth insertion preserves the recent snapshot throttle', async () => {
  const recentDate = new Date();
  const database = createUserDatabase({ Networth: [{ date: recentDate, value: 100 }] });
  const socket = createSocket();

  await wsInsertNetworth({ session: session(7) }, fastifyFor(database), socket);

  assert.equal(socket.frames.at(-1).type, 'networthInsert');
  assert.equal(socket.frames.at(-1).ok, true);
  assert.equal(socket.frames.at(-1).inserted, false);
  assert.equal(socket.frames.at(-1).reason, 'recentEntryExists');
  assert.equal(socket.frames.at(-1).lastDate, recentDate.toISOString());
});
