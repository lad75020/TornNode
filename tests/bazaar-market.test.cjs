'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeItemId,
  normalizeListing,
  normalizeListings,
  findMinimumListing,
  normalizePriceUpdate,
  isValidThreshold,
  evaluateThreshold,
  sanitizeWatchedItems,
  sanitizeThresholds,
} = require('../utils/bazaarMarket.cjs');
const { toPublicItem } = require('../ws/wsGetAllTornItems.cjs');

test('normalizes only positive safe item identifiers', () => {
  assert.equal(normalizeItemId(1234), 1234);
  assert.equal(normalizeItemId('1234'), 1234);
  assert.equal(normalizeItemId(0), null);
  assert.equal(normalizeItemId('-1'), null);
  assert.equal(normalizeItemId('12.5'), null);
  assert.equal(normalizeItemId(Number.MAX_SAFE_INTEGER + 1), null);
});

test('normalizes positive price and integer quantity while dropping invalid listings', () => {
  assert.deepEqual(normalizeListing({ price: '250', amount: '3', seller: 'seller' }), {
    price: 250,
    quantity: 3,
    seller: 'seller',
  });
  assert.deepEqual(normalizeListing({ price: 100, quantity: 2, seller: '' }), {
    price: 100,
    quantity: 2,
  });
  assert.equal(normalizeListing({ price: 0, amount: 2 }), null);
  assert.equal(normalizeListing({ price: 100, amount: 0 }), null);
  assert.equal(normalizeListing({ price: 100, amount: 1.5 }), null);
  assert.equal(normalizeListing({ price: 'not-a-price', amount: 1 }), null);
});

test('selects the lowest valid listing and preserves its quantity', () => {
  const listings = normalizeListings([
    { price: 400, amount: 1 },
    { price: 125, amount: 7 },
    { price: -2, amount: 5 },
    { price: 200, amount: 0 },
  ]);
  assert.deepEqual(findMinimumListing(listings), { price: 125, quantity: 7 });
});

test('normalizes an update and represents an empty valid collection as unavailable', () => {
  assert.deepEqual(normalizePriceUpdate({
    type: 'priceUpdate',
    time: 1710000000000,
    itemId: '9',
    itemName: 'Item',
    listings: [{ price: 10, amount: 2 }, { price: 5, amount: 4 }],
  }), {
    type: 'priceUpdate',
    time: 1710000000000,
    itemId: 9,
    itemName: 'Item',
    minBazaar: 5,
    listings: [{ price: 5, quantity: 4 }],
  });
  assert.deepEqual(normalizePriceUpdate({ type: 'priceUpdate', time: 10, itemId: 9, listings: [] }), {
    type: 'priceUpdate', time: 10, itemId: 9, itemName: '', minBazaar: null, listings: [],
  });
  assert.equal(normalizePriceUpdate({ type: 'priceUpdate', itemId: 'bad', listings: [] }), null);
});

test('threshold evaluation triggers at equality, suppresses repeats, and recovers only above', () => {
  assert.equal(isValidThreshold(1), true);
  assert.equal(isValidThreshold('125'), true);
  assert.equal(isValidThreshold(0), false);
  assert.equal(isValidThreshold(-1), false);
  assert.equal(isValidThreshold('bad'), false);
  assert.deepEqual(evaluateThreshold({ minimum: 100, threshold: 100, triggered: false }), { trigger: true, recovered: false });
  assert.deepEqual(evaluateThreshold({ minimum: 99, threshold: 100, triggered: true }), { trigger: false, recovered: false });
  assert.deepEqual(evaluateThreshold({ minimum: 100, threshold: 100, triggered: true }), { trigger: false, recovered: false });
  assert.deepEqual(evaluateThreshold({ minimum: 101, threshold: 100, triggered: true }), { trigger: false, recovered: true });
  assert.deepEqual(evaluateThreshold({ minimum: null, threshold: 100, triggered: true }), { trigger: false, recovered: false });
  assert.deepEqual(evaluateThreshold({ minimum: 100, threshold: 90, triggered: true }), { trigger: false, recovered: true });
  assert.deepEqual(evaluateThreshold({ minimum: 100, threshold: 110, triggered: false }), { trigger: true, recovered: false });
});

test('sanitizes persisted watches and thresholds', () => {
  assert.deepEqual(sanitizeWatchedItems([1, '2', 2, 0, 'bad', -3]), [1, 2]);
  assert.deepEqual(sanitizeWatchedItems({ 1: true }), []);
  assert.deepEqual(sanitizeThresholds({ 1: 100, 2: '200', 3: 0, 4: -1, 5: 'bad' }), { 1: 100, 2: 200 });
  assert.deepEqual(sanitizeThresholds([]), {});
});

test('public catalog projection allow-lists market fields', () => {
  assert.deepEqual(toPublicItem({
    id: '12',
    name: 'Item',
    price: 250,
    img64: 'data:image/png;base64,abc',
    description: 'Public description',
    type: '  Medical  ',
    apiKey: 'must-not-leak',
    secret: 'must-not-leak',
  }), {
    id: 12,
    name: 'Item',
    price: 250,
    img64: 'data:image/png;base64,abc',
    description: 'Public description',
    type: 'Medical',
  });
  assert.equal(toPublicItem({ id: 12, name: 'Incomplete', price: 1 }), null);
});
