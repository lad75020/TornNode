const DAILY_LABEL = /^\d{4}-\d{2}-\d{2}$/;

function isValidDailyLabel(value) {
  if (typeof value !== 'string' || !DAILY_LABEL.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidDateBoundary(value) {
  return value == null || isValidDailyLabel(value);
}

function emptyDatasets(datasets) {
  if (!Array.isArray(datasets)) return [];
  return datasets.map(dataset => ({
    ...(dataset && typeof dataset === 'object' ? dataset : {}),
    data: []
  }));
}

/**
 * Filter aligned daily datasets without mutating caller-owned labels or data.
 * Unsupported, malformed, or unsorted label formats are left untouched because
 * slicing them by lexical position could present misleading analytics.
 */
export function filterDatasetsByDate(labels, datasets, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return { labels, datasets };
  if (!Array.isArray(labels) || labels.length === 0) return { labels, datasets };
  if (!Array.isArray(datasets)) return { labels, datasets };
  if (!labels.every(isValidDailyLabel)) return { labels, datasets };
  if (labels.some((label, index) => index > 0 && label < labels[index - 1])) return { labels, datasets };

  if (!isValidDateBoundary(dateFrom) || !isValidDateBoundary(dateTo)) {
    return { labels: [], datasets: emptyDatasets(datasets) };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { labels: [], datasets: emptyDatasets(datasets) };
  }

  let start = 0;
  let end = labels.length - 1;
  if (dateFrom) {
    while (start < labels.length && labels[start] < dateFrom) start += 1;
  }
  if (dateTo) {
    while (end >= 0 && labels[end] > dateTo) end -= 1;
  }
  if (end < start) return { labels: [], datasets: emptyDatasets(datasets) };

  return {
    labels: labels.slice(start, end + 1),
    datasets: datasets.map(dataset => ({
      ...(dataset && typeof dataset === 'object' ? dataset : {}),
      data: Array.isArray(dataset?.data) ? dataset.data.slice(start, end + 1) : []
    }))
  };
}

export { isValidDailyLabel };
