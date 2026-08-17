'use strict';

const test = require('node:test');
const {
  assert,
  createSocket,
  createUserDatabase,
  createFastifyForUserDatabases,
} = require('./helpers/tornSyncTestHarness.cjs');
const ensureUserDbStructure = require('../utils/ensureUserDbStructure.cjs');
const wsGetTornAttacks = require('../ws/wsGetTornAttacks.cjs');
const wsRacingSkill = require('../ws/wsRacingSkill.cjs');
const wsStats = require('../ws/wsStats.cjs');

function session(userId, apiKey = 'server-only-key') {
  return { userId, TornAPIKey: apiKey };
}

function fastifyFor(database) {
  return createFastifyForUserDatabases({ '7': database, '8': createUserDatabase() });
}

test('combat analytics attack aggregation is tenant-scoped and range-validated', async () => {
  const userOne = createUserDatabase({ attacks: [
    { code: 'attack', started: 100, attacker: { id: 7 }, result: 'Won' },
    { code: 'defend', started: 101, attacker: { id: 99 }, result: 'Lost' },
    { code: 'outside', started: 200, attacker: { id: 7 }, result: 'Lost' },
  ] });
  const fastify = fastifyFor(userOne);
  const socket = createSocket();

  await wsGetTornAttacks(socket, { session: session(7) }, fastify, {
    from: 100,
    to: 101,
    userId: 8,
  });

  assert.deepEqual(socket.frames.at(-1), {
    type: 'getTornAttacks',
    from: 100,
    to: 101,
    wins: 2,
    losses: 0,
    attacks: 1,
    defends: 1,
  });

  const invalidSocket = createSocket();
  await wsGetTornAttacks(invalidSocket, { session: session(7) }, fastify, { from: 20, to: 10 });
  assert.equal(invalidSocket.frames.at(-1).type, 'getTornAttacks');
  assert.equal(invalidSocket.frames.at(-1).error, 'Invalid synchronization range');
});

test('racing-skill analytics validates the session, projects fields, and closes its cursor', async () => {
  const database = createUserDatabase({ Stats: [
    { _id: 'hidden-1', date: new Date('2026-08-02T00:00:00Z'), personalstats: { racing: { skill: 120 } }, secret: 'hidden' },
    { _id: 'hidden-2', date: new Date('2026-08-01T00:00:00Z'), personalstats: { racing: { skill: 100 } }, secret: 'hidden' },
    { _id: 'invalid', date: new Date('2026-08-03T00:00:00Z'), personalstats: { racing: { skill: 'not-a-number' } } },
  ] });
  let closed = false;
  const stats = database.collection('Stats');
  const originalFind = stats.find.bind(stats);
  stats.find = (...args) => {
    const cursor = originalFind(...args);
    const originalClose = cursor.close;
    cursor.close = async () => { closed = true; await originalClose(); };
    return cursor;
  };
  const socket = createSocket();

  await wsRacingSkill(socket, { session: session(7) }, fastifyFor(database));

  assert.equal(socket.frames.at(-1).type, 'racingskill');
  assert.deepEqual(socket.frames.at(-1).data.map(row => row.racingskill), [100, 120]);
  assert.ok(socket.frames.at(-1).data.every(row => !('_id' in row)));
  assert.equal(closed, true);

  const invalidSocket = createSocket();
  await wsRacingSkill(invalidSocket, { session: {} }, fastifyFor(database));
  assert.equal(invalidSocket.frames.at(-1).type, 'racingskill');
  assert.equal(invalidSocket.frames.at(-1).error, 'Invalid session');
});

test('stats dry-run rejects invalid sessions without leaking credential details', async () => {
  const socket = createSocket();
  await wsStats(socket, { session: { userId: 7 } }, { log: { error() {} } }, {
    dryRun: true,
    cat: 'all',
    requestId: 'probe-1',
  });

  assert.deepEqual(socket.frames.at(-1), {
    type: 'wsStatsTestResult',
    ok: false,
    requestId: 'probe-1',
    error: 'Invalid session',
  });
});

test('stats normal path rejects a session without a valid tenant', async () => {
  const socket = createSocket();
  await wsStats(socket, { session: { TornAPIKey: 'server-only-key' } }, {
    log: { error() {} },
  });

  assert.equal(socket.frames.at(-1).type, 'statsInsert');
  assert.equal(socket.frames.at(-1).ok, false);
  assert.equal(socket.frames.at(-1).inserted, false);
  assert.equal(socket.frames.at(-1).error, 'Invalid session');
  assert.equal('TornAPIKey' in socket.frames.at(-1), false);
});

test('stats normal path preserves the recent-snapshot throttle', async () => {
  const recentDate = new Date();
  const database = createUserDatabase({ Stats: [{ date: recentDate }] });
  const socket = createSocket();

  await wsStats(socket, { session: session(7) }, fastifyFor(database));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'statsInsert',
    ok: true,
    inserted: false,
    reason: 'recentEntryExists',
    lastDate: recentDate.toISOString(),
    message: 'Not inserting Stats (recent entry < 12h)',
    time: socket.frames.at(-1).time,
  });
});

test('racing-skill analytics hides database failures from clients', async () => {
  const database = createUserDatabase();
  database.collection('Stats').find = () => {
    throw new Error('internal database details');
  };
  const socket = createSocket();

  await wsRacingSkill(socket, { session: session(7) }, fastifyFor(database));

  assert.deepEqual(socket.frames.at(-1), {
    type: 'racingskill',
    error: 'Racing skill could not be loaded. Please retry.',
  });
  assert.equal(JSON.stringify(socket.frames.at(-1).error).includes('internal'), false);
});

test('analytics handlers keep user database structure setup idempotent', async () => {
  ensureUserDbStructure.clearCache();
  const database = createUserDatabase();
  const fastify = fastifyFor(database);
  await ensureUserDbStructure(fastify, 7, fastify.log);
  await ensureUserDbStructure(fastify, 7, fastify.log);
  assert.ok(database.collection('Stats').indexes.length >= 1);
});
