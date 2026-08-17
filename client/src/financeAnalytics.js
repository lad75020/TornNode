const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

export function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.replace(/[$,\s]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toUnixDate(timestamp) {
  const seconds = toFiniteNumber(timestamp);
  if (seconds === null || seconds < 0 || seconds > 100_000_000_000) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function utcDay(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}

export function isoWeekInfo(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((day - yearStart) / DAY_MS) + 1) / 7);
  const monday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() || 7) + 1);
  return { year: day.getUTCFullYear(), week, monday };
}

export function isoWeekKey(date) {
  const info = isoWeekInfo(date);
  return info ? `${info.year}-W${String(info.week).padStart(2, '0')}` : null;
}

export function monthKey(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    : null;
}

export function bucketForDate(date, granularity = 'day') {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (granularity === 'week') {
    const info = isoWeekInfo(date);
    return info && { label: isoWeekKey(date), sortKey: info.monday.getTime() };
  }
  if (granularity === 'month') {
    const sortKey = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    return { label: monthKey(date), sortKey };
  }
  const label = utcDay(date);
  return label && { label, sortKey: Date.parse(`${label}T00:00:00Z`) };
}

function parseBucketBounds(label, granularity) {
  if (granularity === 'week') {
    const match = ISO_WEEK.exec(label);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (week - 1) * 7);
    const sunday = new Date(monday.getTime() + 6 * DAY_MS);
    return { from: utcDay(monday), to: utcDay(sunday) };
  }
  if (granularity === 'month') {
    if (!ISO_MONTH.test(label)) return null;
    const start = new Date(`${label}-01T00:00:00Z`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { from: utcDay(start), to: utcDay(end) };
  }
  if (!ISO_DAY.test(label)) return null;
  return { from: label, to: label };
}

export function bucketIntersectsRange(label, dateFrom, dateTo, granularity = 'day') {
  if (!dateFrom && !dateTo) return true;
  const bounds = parseBucketBounds(label, granularity);
  if (!bounds) return false;
  if (dateFrom && bounds.to < dateFrom) return false;
  if (dateTo && bounds.from > dateTo) return false;
  return true;
}

export function filterBuckets(labels, datasets, dateFrom, dateTo, granularity = 'day') {
  if (!Array.isArray(labels) || !Array.isArray(datasets)) return { labels: [], datasets: [] };
  const indexes = labels
    .map((label, index) => bucketIntersectsRange(label, dateFrom, dateTo, granularity) ? index : -1)
    .filter(index => index >= 0);
  return {
    labels: indexes.map(index => labels[index]),
    datasets: datasets.map(dataset => ({
      ...dataset,
      data: indexes.map(index => dataset.data?.[index]),
    })),
  };
}

export function aggregateRows(rows, {
  granularity = 'day',
  getTimestamp = row => row?.timestamp,
  getValues = row => [row?.value],
  getItem = row => row,
} = {}) {
  const buckets = new Map();
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    const date = toUnixDate(getTimestamp(row));
    if (!date) continue;
    const bucket = bucketForDate(date, granularity);
    if (!bucket) continue;
    const values = getValues(row);
    if (!Array.isArray(values)) continue;
    const finiteValues = values.map(toFiniteNumber);
    if (!finiteValues.some(value => value !== null)) continue;
    let entry = buckets.get(bucket.label);
    if (!entry) {
      entry = { label: bucket.label, sortKey: bucket.sortKey, sums: values.map(() => 0), items: [] };
      buckets.set(bucket.label, entry);
    }
    finiteValues.forEach((value, index) => {
      if (value !== null) entry.sums[index] += value;
    });
    entry.items.push(getItem(row));
  }
  return [...buckets.values()].sort((left, right) => left.sortKey - right.sortKey);
}

export function resetDataArrays(length) {
  return Array.from({ length }, () => 0);
}
