'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const wsDailyPriceAverages = require('../ws/wsDailyPriceAverages.cjs');
const { isPublicBazaarCommand } = require('../ws/wsBazaarPrice.cjs');
const { normalizeHistoryDate } = wsDailyPriceAverages;

function cursorFor(documents) {
  let index = 0;
  return {
    async hasNext() { return index < documents.length; },
    async next() { return documents[index++]; },
  };
}

function fakeFastify(documents) {
  return {
    mongo: {
      db() {
        return { collection() { return { find() { return cursorFor(documents); } }; } };
      },
    },
    log: { error() {}, warn() {} },
  };
}

test('daily history handler returns only valid, ordered public points', async () => {
  const frames = [];
  await wsDailyPriceAverages(
    { send(frame) { frames.push(JSON.parse(frame)); } },
    {},
    fakeFastify([
      {
        id: 12,
        name: 'Item',
        dailyPriceAverages: [
          { date: '2026-08-17', avg: 200 },
          { date: '2026-08-15', avg: 100 },
          { date: 'not-a-date', avg: 500 },
          { date: '2026-08-16', avg: NaN },
          { date: '2999-01-01', avg: 999 },
        ],
        secret: 'must-not-leak',
      },
      { id: 'not-an-id', name: 'bad', dailyPriceAverages: [{ date: '2026-08-15', avg: 10 }] },
    ]),
  );
  assert.equal(frames.length, 1);
  assert.equal(frames[0].ok, true);
  assert.deepEqual(frames[0].lines, [{
    id: 12,
    name: 'Item',
    points: [
      { date: '2026-08-15', avg: 100 },
      { date: '2026-08-17', avg: 200 },
    ],
  }]);
  assert.equal(JSON.stringify(frames[0]).includes('must-not-leak'), false);
});

test('history date normalization rejects rollover dates and accepts leap days', () => {
  assert.equal(normalizeHistoryDate('2026-02-31'), null);
  assert.equal(normalizeHistoryDate('20260231'), null);
  assert.equal(normalizeHistoryDate('2026-13-01'), null);
  assert.equal(normalizeHistoryDate('20260229'), null);
  assert.equal(normalizeHistoryDate('2024-02-29'), '2024-02-29');
});

test('daily history handler does not expose internal errors', async () => {
  const frames = [];
  const fastify = { mongo: { db() { throw new Error('mongo credentials leaked'); } }, log: { error() {} } };
  await wsDailyPriceAverages({ send(frame) { frames.push(JSON.parse(frame)); } }, {}, fastify);
  assert.deepEqual(frames, [{
    type: 'dailyPriceAveragesAll',
    ok: false,
    error: 'Market history could not be loaded. Please retry.',
  }]);
});

test('public bazaar command allow-list excludes private operations', () => {
  assert.equal(isPublicBazaarCommand('getAllTornItems'), true);
  assert.equal(isPublicBazaarCommand('dailyPriceAveragesAll'), true);
  assert.equal(isPublicBazaarCommand('dailyPriceAverage'), false);
  assert.equal(isPublicBazaarCommand('getNetworth'), false);
  assert.equal(isPublicBazaarCommand('ping'), true);
});
