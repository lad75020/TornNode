const MAX_POINTS = 5000;
const SECOND_EPOCH_CUTOFF = 10_000_000_000;

export function finiteNumber(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

export function normalizeTimestamp(value) {
  const timestamp = finiteNumber(value);
  if (timestamp === null || timestamp < 0) return null;
  const milliseconds = timestamp < SECOND_EPOCH_CUTOFF ? timestamp * 1000 : timestamp;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

export function canonicalPoints(rawPoints, { includePrice = false } = {}) {
  if (!Array.isArray(rawPoints)) return [];
  const points = [];
  for (const raw of rawPoints.slice(0, MAX_POINTS)) {
    const t = normalizeTimestamp(raw?.t);
    const v = finiteNumber(raw?.v);
    if (t === null || v === null) continue;
    const point = { t, v };
    if (includePrice) {
      const p = finiteNumber(raw?.p);
      if (p !== null) point.p = p;
    }
    points.push(point);
  }
  return points.toSorted((left, right) => left.t - right.t);
}

export function normalizeMetricSeries(rawSeries) {
  if (!rawSeries || typeof rawSeries !== 'object' || Array.isArray(rawSeries)) return {};
  const series = {};
  for (const [metric, rawPoints] of Object.entries(rawSeries)) {
    if (typeof metric !== 'string' || !metric) continue;
    const points = canonicalPoints(rawPoints);
    if (points.length) series[metric] = points;
  }
  return series;
}

export function normalizeStockHistory(rawSeries) {
  const totalInStock = canonicalPoints(rawSeries?.totalInStock);
  const items = {};
  if (rawSeries?.items && typeof rawSeries.items === 'object' && !Array.isArray(rawSeries.items)) {
    for (const [name, rawPoints] of Object.entries(rawSeries.items)) {
      const points = canonicalPoints(rawPoints, { includePrice: true });
      if (typeof name === 'string' && name && points.length) items[name] = points;
    }
  }
  return { totalInStock, items };
}

export function normalizeStockRows(rawStock) {
  const entries = Array.isArray(rawStock)
    ? rawStock.map((item, index) => [String(index), item])
    : rawStock && typeof rawStock === 'object' ? Object.entries(rawStock) : [];
  return entries.flatMap(([fallbackName, item]) => {
    if (!item || typeof item !== 'object') return [];
    const name = item.name || item.item || item.item_name || fallbackName;
    if (typeof name !== 'string' || !name) return [];
    return [{ name, item }];
  });
}

export function safeErrorMessage(code) {
  switch (code) {
    case 'unauthorized': return 'Company analytics requires an authenticated session.';
    case 'invalid_range': return 'Choose a valid, shorter date range.';
    default: return 'Company analytics could not be loaded. Please retry.';
  }
}
