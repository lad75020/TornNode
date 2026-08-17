import { aggregateRows, filterBuckets, toFiniteNumber, toUnixDate } from './financeAnalytics.js';

export function normaliseGranularity(value) {
  if (value === 'daily') return 'day';
  if (value === 'weekly') return 'week';
  if (value === 'monthly') return 'month';
  return ['day', 'week', 'month'].includes(value) ? value : 'day';
}

export function chartBuckets(rows, { granularity = 'day', getTimestamp, getValues, getItem } = {}) {
  return aggregateRows(rows, { granularity: normaliseGranularity(granularity), getTimestamp, getValues, getItem });
}

export function bucketChartData(buckets, datasets, dateFrom, dateTo, granularity = 'day') {
  return filterBuckets(
    buckets.map(bucket => bucket.label),
    datasets,
    dateFrom,
    dateTo,
    normaliseGranularity(granularity),
  );
}

export function validTimestamp(row) {
  return Boolean(toUnixDate(row?.timestamp));
}

export function finiteNonNegative(value) {
  const number = toFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export function notifyMinDate(buckets, onMinDate) {
  const first = buckets[0]?.label;
  if (first && /^\d{4}-\d{2}-\d{2}$/.test(first) && typeof onMinDate === 'function') {
    try { onMinDate(first); } catch { /* dashboard callbacks must not break charts */ }
  }
}
