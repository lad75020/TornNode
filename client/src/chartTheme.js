// Utilitaires de thème Chart.js (clair/sombre)
// Fournit fonctions pour générer couleurs dataset et options.

export function getChartColors(darkMode) {
  return {
    text: darkMode ? '#e0e0e0' : '#222',
    grid: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    linePalette: darkMode
      ? ['#8ab4ff', '#ffb74d', '#b39ddb', '#80cbc4', '#ef9a9a', '#c5e1a5']
      : ['#36a2eb', '#ff9f40', '#9966ff', '#4bc0c0', '#ff6384', '#8bc34a'],
    barPalette: darkMode
      ? ['rgba(72, 75, 246, 0.91)', 'rgba(248, 48, 48, 0.82)', 'rgba(179,157,219,0.7)', 'rgba(128,203,196,0.7)', 'rgba(239,154,154,0.7)']
      : ['rgba(73, 79, 255, 0.88)', 'rgba(247, 60, 60, 0.87)', 'rgba(153,102,255,0.7)', 'rgba(54,162,235,0.7)', 'rgba(244, 255, 36, 0.93)']
  };
}

export function applyCommonChartOptions(baseOptions = {}, darkMode) {
  const { text, grid } = getChartColors(Boolean(darkMode));
  const basePlugins = baseOptions.plugins || {};
  const baseTooltip = basePlugins.tooltip === false ? false : (basePlugins.tooltip || {});
  const baseLegend = basePlugins.legend === false ? false : (basePlugins.legend || {});
  const baseTitle = basePlugins.title === false ? false : (basePlugins.title || null);
  const chartBackground = darkMode ? '#1b1b1b' : '#ffffff';

  return {
    ...baseOptions,
    plugins: {
      ...basePlugins,
      decimation: basePlugins.decimation ?? { enabled: true, algorithm: 'lttb', samples: 500 },
      legend: baseLegend === false ? false : {
        ...baseLegend,
        labels: { ...(baseLegend.labels || {}), color: text }
      },
      title: baseTitle === false ? false : (baseTitle ? { ...baseTitle, color: text } : baseTitle),
      tooltip: baseTooltip === false ? false : {
        ...baseTooltip,
        titleColor: baseTooltip.titleColor ?? text,
        bodyColor: baseTooltip.bodyColor ?? text,
        backgroundColor: baseTooltip.backgroundColor ?? chartBackground,
        borderColor: baseTooltip.borderColor ?? grid,
        borderWidth: baseTooltip.borderWidth ?? 1
      }
    },
    scales: Object.fromEntries(
      Object.entries(baseOptions.scales || {}).map(([key, scale]) => {
        const safeScale = scale && typeof scale === 'object' ? scale : {};
        return [key, {
          ...safeScale,
          ticks: { color: text, ...(safeScale.ticks || {}) },
          grid: { ...(safeScale.grid || {}), color: safeScale.grid?.color ?? grid },
          title: safeScale.title ? { ...safeScale.title, color: safeScale.title.color ?? text } : safeScale.title
        }];
      })
    )
  };
}

// Helper pour créer un dataset (line ou bar) avec couleurs automatiques.
export function buildDataset(kind, index, data, darkMode, overrides = {}) {
  const { linePalette, barPalette } = getChartColors(Boolean(darkMode));
  const palette = kind === 'bar' ? barPalette : linePalette;
  const paletteIndex = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0;
  const baseColor = palette[paletteIndex % palette.length];
  const solid = baseColor
    .replace(/0\.7\)/, '1)')
    .replace(/0\.6\)/, '1)')
    .replace(/0\.9\)/, '1)');
  return {
    type: kind,
    data,
    borderColor: solid,
    backgroundColor: baseColor,
    ...overrides
  };
}

// Calculs récurrents pour séries dérivées (cumul & moyenne).
export function computeSeries(values) {
  const safeValues = Array.isArray(values) ? values : [];
  const cumulative = [];
  let run = 0;
  for (const value of safeValues) {
    const numeric = Number(value) || 0;
    run += numeric;
    cumulative.push(run);
  }
  const average = safeValues.length ? Math.round(run / safeValues.length) : 0;
  return { cumulative, average };
}
