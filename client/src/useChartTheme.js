import { useCallback, useMemo } from 'react';
import { applyCommonChartOptions, buildDataset, getChartColors } from './chartTheme.js';
import { CHART_MARGINS } from './chartConstants.js';

// Hook central pour générer couleurs, builder de datasets et options enrichies.
export function useChartTheme(darkMode) {
  const theme = useMemo(() => getChartColors(Boolean(darkMode)), [darkMode]);

  const themedOptions = useCallback((baseOptions = {}) => {
    const baseLayout = baseOptions.layout || {};
    const merged = {
      ...baseOptions,
      layout: {
        ...baseLayout,
        padding: baseLayout.padding || {
          top: CHART_MARGINS.top,
          right: CHART_MARGINS.right,
          bottom: CHART_MARGINS.bottom,
          left: CHART_MARGINS.left
        }
      }
    };
    return applyCommonChartOptions(merged, Boolean(darkMode));
  }, [darkMode]);

  const ds = useCallback((kind, index, data, overrides) => (
    buildDataset(kind, index, data, Boolean(darkMode), overrides)
  ), [darkMode]);

  return { theme, themedOptions, ds, CHART_MARGINS };
}

export default useChartTheme;
