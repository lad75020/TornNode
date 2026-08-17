'use strict';

function normalizeItemId(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    value = Number(trimmed);
  }
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function positiveFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeListing(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const price = positiveFiniteNumber(raw.price);
  const quantityValue = raw.quantity !== undefined ? raw.quantity : raw.amount;
  const quantity = Number(quantityValue);
  if (price === null || !Number.isSafeInteger(quantity) || quantity <= 0) return null;

  const listing = { price, quantity };
  if (typeof raw.seller === 'string' && raw.seller.trim()) {
    listing.seller = raw.seller.trim();
  }
  return listing;
}

function normalizeListings(rawListings) {
  if (!Array.isArray(rawListings)) return [];
  return rawListings.map(normalizeListing).filter(Boolean);
}

function findMinimumListing(listings) {
  if (!Array.isArray(listings) || listings.length === 0) return null;
  return listings.reduce((minimum, listing) => (
    listing.price < minimum.price ? listing : minimum
  ), listings[0]);
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return Date.now();
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function normalizePriceUpdate(payload) {
  if (!payload || typeof payload !== 'object' || payload.type !== 'priceUpdate') return null;
  const itemId = normalizeItemId(payload.itemId);
  const time = normalizeTimestamp(payload.time);
  if (itemId === null || time === null || !Array.isArray(payload.listings)) return null;

  const listings = normalizeListings(payload.listings);
  const minimum = findMinimumListing(listings);
  return {
    type: 'priceUpdate',
    time,
    itemId,
    itemName: typeof payload.itemName === 'string' ? payload.itemName.trim() : '',
    minBazaar: minimum ? minimum.price : null,
    listings: minimum ? [minimum] : [],
  };
}

function isValidThreshold(value) {
  return positiveFiniteNumber(value) !== null;
}

function evaluateThreshold({ minimum, threshold, triggered = false } = {}) {
  const normalizedThreshold = positiveFiniteNumber(threshold);
  const normalizedMinimum = positiveFiniteNumber(minimum);
  if (normalizedThreshold === null || normalizedMinimum === null) {
    return { trigger: false, recovered: false };
  }
  if (normalizedMinimum > normalizedThreshold) {
    return { trigger: false, recovered: Boolean(triggered) };
  }
  return { trigger: !triggered, recovered: false };
}

function sanitizeWatchedItems(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const candidate of value) {
    const itemId = normalizeItemId(candidate);
    if (itemId === null || seen.has(itemId)) continue;
    seen.add(itemId);
    result.push(itemId);
  }
  return result;
}

function sanitizeThresholds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [rawId, rawThreshold] of Object.entries(value)) {
    const itemId = normalizeItemId(rawId);
    const threshold = positiveFiniteNumber(rawThreshold);
    if (itemId !== null && threshold !== null) result[itemId] = threshold;
  }
  return result;
}

module.exports = {
  normalizeItemId,
  normalizeListing,
  normalizeListings,
  findMinimumListing,
  normalizePriceUpdate,
  isValidThreshold,
  evaluateThreshold,
  sanitizeWatchedItems,
  sanitizeThresholds,
  positiveFiniteNumber,
};
