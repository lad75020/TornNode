import { useMemo } from 'react';
import { applyCommonChartOptions, buildDataset, getChartColors } from './chartTheme.js';
import { CHART_MARGINS } from './chartConstants.js';

// Hook central pour générer couleurs, builder de datasets et options enrichies
export function useChartTheme(darkMode) {
  const theme = useMemo(() => getChartColors(darkMode), [darkMode]);
  function themedOptions(baseOptions) {
    const merged = {
      layout: {
        ...(baseOptions?.layout || {}),
        padding: baseOptions?.layout?.padding || {
          top: CHART_MARGINS.top,
            right: CHART_MARGINS.right,
            bottom: CHART_MARGINS.bottom,
            left: CHART_MARGINS.left,
        }
      },
      ...baseOptions,
    };
    return applyCommonChartOptions(merged, darkMode);
  }
  function ds(kind, index, data, overrides) {
    return buildDataset(kind, index, data, darkMode, overrides);
  }
  return { theme, themedOptions, ds, CHART_MARGINS };
}

export default useChartTheme;
