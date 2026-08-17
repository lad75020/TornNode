'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEpochMs,
  normalizeRange,
  normalizePoint,
  canonicalSeries,
  normalizeStockItems,
} = require('../utils/companyAnalytics.cjs');
const wsGetCompanyStockHistory = require('../ws/wsGetCompanyStockHistory.cjs');
const wsGetCompanyProfileHistory = require('../ws/wsGetCompanyProfileHistory.cjs');
const wsGetCompanyDetailsHistory = require('../ws/wsGetCompanyDetailsHistory.cjs');
const wsCompanyTrainRange = require('../ws/wsCompanyTrainRange.cjs');
const wsCompanyStock = require('../ws/wsCompanyStock.cjs');
const wsCompanyProfile = require('../ws/wsCompanyProfile.cjs');
const wsCompanyDetails = require('../ws/wsCompanyDetails.cjs');
const {
  createSocket,
  createUserDatabase,
  createFastifyForUserDatabases,
} = require('./helpers/tornSyncTestHarness.cjs');

function session(userId, apiKey = 'server-only-key') {
  return { userId, TornAPIKey: apiKey };
}

function fastifyFor(userId, database) {
  return createFastifyForUserDatabases({ [String(userId)]: database });
}

for (const [name, type, handler] of [
  ['stock', 'companyStock', wsCompanyStock],
  ['profile', 'companyProfile', wsCompanyProfile],
  ['details', 'companyDetails', wsCompanyDetails],
]) {
  test(`current company ${name} rejects unauthorized requests before database access`, async () => {
    let databaseTouched = false;
    const socket = createSocket();
    await handler(socket, { session: { userId: 17 } }, {
      mongo: { client: { db() { databaseTouched = true; } } },
    }, { requestId: `unauthorized-${name}` });
    assert.deepEqual(socket.frames.at(-1), {
      type, ok: false, error: 'unauthorized', requestId: `unauthorized-${name}`,
    });
    assert.equal(databaseTouched, false);
  });

  test(`current company ${name} returns a safe upstream error envelope`, async () => {
    const socket = createSocket();
    await handler(socket, { session: session(17, 'secret-api-key') }, {
      mongo: { client: { db() { throw new Error('secret database and API details'); } } },
      log: { warn() {}, error() {} },
    }, { requestId: `error-${name}` });
    const response = socket.frames.at(-1);
    assert.deepEqual(response, {
      type, ok: false, error: 'snapshot_unavailable', requestId: `error-${name}`,
    });
    assert.equal(JSON.stringify(response).includes('secret'), false);
    assert.equal(JSON.stringify(response).includes('TornAPIKey'), false);
  });
}

test('company analytics helpers normalize finite canonical history points', () => {
  assert.equal(normalizeEpochMs(1_730_000_000), 1_730_000_000_000);
  assert.equal(normalizeEpochMs(1_730_000_000_000), 1_730_000_000_000);
  assert.equal(normalizeEpochMs(Infinity), null);
  assert.deepEqual(normalizePoint(1_730_000_000, 0, '250'), {
    t: 1_730_000_000_000,
    v: 0,
    p: 250,
  });
  assert.equal(normalizePoint(1_730_000_000, 'not-a-number'), null);

  assert.deepEqual(canonicalSeries([
    { t: 1_730_000_002, v: 2 },
    { t: 1_730_000_001_000, v: 1 },
    { t: 1_730_000_002, v: Infinity },
  ]), [
    { t: 1_730_000_001_000, v: 1 },
    { t: 1_730_000_002_000, v: 2 },
  ]);
});

test('company analytics helpers normalize ranges and legacy stock shapes without fake zeroes', () => {
  assert.deepEqual(normalizeRange({ from: 1_730_000_002, to: 1_730_000_001 }, {
    defaultFrom: 1_700_000_000_000,
    defaultTo: 1_800_000_000_000,
  }), { from: 1_730_000_001_000, to: 1_730_000_002_000 });
  assert.equal(normalizeRange({ from: 'bad', to: 1 }, { defaultFrom: 1, defaultTo: 2 }), null);

  assert.deepEqual(normalizeStockItems({
    'Energy Drink': { in_stock: 0, price: 25_000 },
    Broken: { in_stock: 'bad' },
  }), [{ name: 'Energy Drink', inStock: 0, price: 25_000 }]);
  assert.deepEqual(normalizeStockItems([
    { item_name: 'Feather', in_stock: 4, price: 0 },
  ]), [{ name: 'Feather', inStock: 4, price: 0 }]);
});

test('stock history is tenant-scoped and canonicalizes legacy finite stock data', async () => {
  const database = createUserDatabase({ CompanyStock: [
    { timestamp: 1_730_000_002, stocks: { Energy: { in_stock: 3, price: 5 } } },
    { timestamp: 1_730_000_001_000, stock: [{ item_name: 'Energy', in_stock: 0, price: 4 }, { item_name: 'Broken', in_stock: 'NaN' }] },
  ] });
  const socket = createSocket();
  await wsGetCompanyStockHistory(socket, { session: session(17) }, fastifyFor(17, database), {
    from: 1_730_000_000,
    to: 1_730_000_003,
    top: 99,
    userId: 99,
  });

  const response = socket.frames.at(-1);
  assert.equal(response.ok, true);
  assert.equal(response.meta.top, 50);
  assert.deepEqual(response.series.totalInStock, [
    { t: 1_730_000_001_000, v: 0 },
    { t: 1_730_000_002_000, v: 3 },
  ]);
  assert.deepEqual(response.series.items.Energy, [
    { t: 1_730_000_001_000, v: 0, p: 4 },
    { t: 1_730_000_002_000, v: 3, p: 5 },
  ]);
});

test('profile and details histories omit invalid values and normalize mixed epochs', async () => {
  const database = createUserDatabase({
    CompanyProfile: [
      { timestamp: 1_730_000_000, company: { daily_income: 0, weekly_income: 'invalid' } },
      { timestamp: 1_730_000_001_000, company: { daily_income: 4, weekly_income: 9 } },
    ],
    CompanyDetails: [
      { timestamp: 1_730_000_000, details: { popularity: 2, environment: Infinity, efficiency: 'bad' } },
      { timestamp: 1_730_000_001_000, details: { popularity: 3, environment: 4 } },
    ],
  });
  const fastify = fastifyFor(17, database);
  const profileSocket = createSocket();
  await wsGetCompanyProfileHistory(profileSocket, { session: session(17) }, fastify, {
    from: 1_730_000_002,
    to: 1_730_000_000,
  });
  assert.deepEqual(profileSocket.frames.at(-1).series, {
    daily_income: [{ t: 1_730_000_000_000, v: 0 }, { t: 1_730_000_001_000, v: 4 }],
    weekly_income: [{ t: 1_730_000_001_000, v: 9 }],
  });

  const detailsSocket = createSocket();
  await wsGetCompanyDetailsHistory(detailsSocket, { session: session(17) }, fastify, {
    from: 1_730_000_002,
    to: 1_730_000_000,
  });
  assert.deepEqual(detailsSocket.frames.at(-1).series, {
    popularity: [{ t: 1_730_000_000_000, v: 2 }, { t: 1_730_000_001_000, v: 3 }],
    environment: [{ t: 1_730_000_001_000, v: 4 }],
  });
});

test('company training ranges reject unauthenticated and invalid requests before database access', async () => {
  let databaseTouched = false;
  const fastify = { mongo: { client: { db() { databaseTouched = true; throw new Error('must not read'); } } }, log: { warn() {}, error() {} } };
  const unauthorized = createSocket();
  await wsCompanyTrainRange(unauthorized, { session: { userId: 17 } }, fastify, { from: 1, to: 2 });
  assert.deepEqual(unauthorized.frames.at(-1), { type: 'companyTrainRange', ok: false, error: 'unauthorized' });
  assert.equal(databaseTouched, false);

  const invalid = createSocket();
  await wsCompanyTrainRange(invalid, { session: session(17) }, fastify, { from: 2, to: 2 });
  assert.deepEqual(invalid.frames.at(-1), { type: 'companyTrainRange', ok: false, error: 'invalid_range' });
  assert.equal(databaseTouched, false);
});

test('company training range aggregates finite data by UTC day with a typed empty-safe response', async () => {
  const database = createUserDatabase({ logs: [
    { timestamp: 1_730_000_000, log: 6264, data: { working_stats_received: '1,2,3' } },
    { timestamp: 1_730_000_100, log: 6220, data: { working_stats_received: 'bad,4,5' } },
  ] });
  const socket = createSocket();
  await wsCompanyTrainRange(socket, { session: session(17) }, fastifyFor(17, database), {
    from: 1_730_000_000,
    to: 1_730_000_200,
  });
  assert.deepEqual(socket.frames.at(-1), {
    type: 'companyTrainRange', ok: true, from: 1_730_000_000, to: 1_730_000_200,
    data: [{ date: '2024-10-27', manual: 1, intelligence: 6, endurance: 8, trains: 1 }],
  });
});
