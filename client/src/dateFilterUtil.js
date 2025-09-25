// Utilitaire de filtrage des datasets par plage de dates (format YYYY-MM-DD uniquement)
export function filterDatasetsByDate(labels, datasets, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return { labels, datasets };
  if (!labels || !labels.length) return { labels, datasets };
  const isDaily = labels.every(l => /^\d{4}-\d{2}-\d{2}$/.test(l));
  if (!isDaily) return { labels, datasets }; // ne tente pas de filtrer formats semaine/mois
  let start = 0; let end = labels.length - 1;
  if (dateFrom) { while (start < labels.length && labels[start] < dateFrom) start++; }
  if (dateTo) { while (end >= 0 && labels[end] > dateTo) end--; }
  if (end < start) return { labels: [], datasets: datasets.map(d => ({ ...d, data: [] })) };
  const newLabels = labels.slice(start, end + 1);
  const newDatasets = datasets.map(d => ({ ...d, data: d.data.slice(start, end + 1) }));
  return { labels: newLabels, datasets: newDatasets };
}
