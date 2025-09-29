// Utilitaires de thème Chart.js (clair/sombre)
// Fournit fonctions pour générer couleurs dataset et options

export function getChartColors(darkMode) {
  return {
    text: darkMode ? '#e0e0e0' : '#222',
    grid: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    linePalette: darkMode
      ? [ '#8ab4ff', '#ffb74d', '#b39ddb', '#80cbc4', '#ef9a9a', '#c5e1a5' ]
      : [ '#36a2eb', '#ff9f40', '#9966ff', '#4bc0c0', '#ff6384', '#8bc34a' ],
    barPalette: darkMode
      ? [ 'rgba(138,180,255,0.7)', 'rgba(255,183,77,0.7)', 'rgba(179,157,219,0.7)', 'rgba(128,203,196,0.7)', 'rgba(239,154,154,0.7)' ]
      : [ 'rgba(75,192,192,0.7)', 'rgba(255,205,86,0.7)', 'rgba(153,102,255,0.7)', 'rgba(54,162,235,0.7)', 'rgba(255,99,132,0.7)' ],
  };
}

export function applyCommonChartOptions(baseOptions = {}, darkMode) {
  const { text, grid } = getChartColors(darkMode);
  return {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      // Enable decimation by default for better performance with large sets
      decimation: baseOptions.plugins?.decimation ?? { enabled: true, algorithm: 'lttb', samples: 500 },
      legend: baseOptions.plugins?.legend === false ? false : {
        ...(baseOptions.plugins?.legend || {}),
        labels: { ...(baseOptions.plugins?.legend?.labels || {}), color: text }
      },
      title: baseOptions.plugins?.title ? {
        ...baseOptions.plugins.title,
        color: text
      } : baseOptions.plugins?.title,
      tooltip: baseOptions.plugins?.tooltip || { enabled: true }
    },
    scales: Object.fromEntries(
      Object.entries(baseOptions.scales || {}).map(([key, scale]) => [
        key,
        {
          ...scale,
          ticks: { color: text, ...(scale.ticks || {}) },
          grid: scale.grid ? { ...scale.grid, color: grid } : { color: grid }
        }
      ])
    )
  };
}

// Helper pour créer un dataset (line ou bar) avec couleurs automatiques
export function buildDataset(kind, index, data, darkMode, overrides = {}) {
  const { linePalette, barPalette } = getChartColors(darkMode);
  const palette = kind === 'bar' ? barPalette : linePalette;
  const baseColor = palette[index % palette.length];
  const solid = baseColor.replace(/0\.7\)/,'1)').replace(/0\.6\)/,'1)').replace(/0\.9\)/,'1)');
  return {
    type: kind,
    data,
    borderColor: solid,
    backgroundColor: baseColor,
    ...overrides,
  };
}

// Calculs récurrents pour séries dérivées (cumul & moyenne)
export function computeSeries(values) {
  const cumulative = [];
  let run = 0;
  for (const v of values) { run += v; cumulative.push(run); }
  const average = values.length ? Math.round(run / values.length) : 0;
  return { cumulative, average };
}
