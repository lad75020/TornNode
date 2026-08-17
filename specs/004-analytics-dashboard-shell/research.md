# Research: Analytics Dashboard Shell

**Feature**: Analytics Dashboard Shell
**Branch**: `feature/time-machine-analytics-dashboard-shell`
**Date**: 2026-08-17

## Existing Structure Findings

- The codebase-memory project `Volumes-WDBlack4TB-Code-tornnode` is ready with 1,920 nodes and 3,396 edges.
- `Main` in `client/src/main.jsx` is the composition root. The graph reports high fan-out into `useChartSlider`, `useTheme`, `ToastHost`, `useAppWebSocket`, `useWsMessageBus`, cache helpers, and chart components.
- The chart registry is already composed of lazy imports and `ChartSlider` renders the selected component inside a `Suspense` fallback. The active chart is represented by `/chart/:idx` and receives shared `token`, WebSocket, theme, height, date, and minimum-date props.
- `filterDatasetsByDate` in `client/src/dateFilterUtil.js` has 11 inbound callers, so compatibility and predictable no-op behavior for unsupported labels are more important than introducing a new filtering abstraction.
- `ThemeProvider` in `client/src/hooks/themeContext.js` persists `themePreference`, supports `dark`, `light`, and automatic mode, optionally uses geolocation/daylight data, and schedules recalculation. `usePersistentState` already catches storage failures.
- `useChartSlider` persists `chartsAutoPlay` and owns a 30-second interval, but the current `ChartSlider` path does not fully synchronize that internal index with route navigation. This is the main lifecycle/behavior gap for the shell.
- `toastBus.js` publishes `CustomEvent('toast')` through an `EventTarget`; `pushOrReplaceToast` adds a stable replacement key. `ToastHost.jsx` subscribes once, replaces matching entries, expires non-persistent entries, and renders through a portal.
- `chartTheme.js` already centralizes text/grid palettes, common options, decimation defaults, and dataset colors. `useChartTheme.js` is a thin adapter used by many chart components.

## Decisions

### D-001: Keep the existing client composition root

**Decision**: Improve the current `Main`/`ChartSlider` boundary instead of introducing a new dashboard package or state library.

**Rationale**: The graph and source show that `Main` already owns the shell state and prop contract. A second state owner would create route/date/theme synchronization hazards and broaden the feature beyond its listed files.

**Alternatives considered**:

- New dashboard context: rejected because it duplicates state already coordinated by `Main` and does not reduce the affected surface.
- Rebuild each chart as a route page: rejected because it would repeat shared controls and break the existing chart prop contract.

### D-002: Treat the URL as active-chart truth

**Decision**: Keep `/chart/:idx` as the canonical selected view. Normalize/clamp invalid indexes and make automatic rotation navigate to the next route rather than only mutating an internal counter.

**Rationale**: The current component derives its index from `useParams()` and uses `navigate()` for previous/next. Keeping one source of truth avoids a stale chart when URL, browser history, and rotation disagree.

**Alternatives considered**:

- Keep an independent internal index: rejected because it can be reset by the route effect and does not update browser history.
- Replace routing with local state: rejected because direct chart URLs and browser back/forward behavior are existing application behavior.

### D-003: Preserve the pure daily-label filter contract

**Decision**: Keep `filterDatasetsByDate(labels, datasets, dateFrom, dateTo)` pure, inclusive, and no-op for unsupported label formats. Validate malformed/missing data defensively and return aligned empty datasets for an empty valid range.

**Rationale**: Eleven graph callers already depend on the utility. A stable, linear function is safer than moving filtering into each chart or adding a dependency.

**Alternatives considered**:

- Parse every label with a date library: rejected because weekly/monthly labels have different semantics and the existing contract explicitly distinguishes daily labels.
- Filter only labels: rejected because it breaks label-to-series alignment.

### D-004: Reuse persistent theme context and shared chart helpers

**Decision**: Keep preference storage in `ThemeProvider`, automatic fallback when geolocation/daylight data is unavailable, and shared colors/options in `chartTheme.js`/`useChartTheme.js`.

**Rationale**: The existing boundary already serves the shell and many chart consumers. Centralized changes keep legends, ticks, grids, tooltips, and datasets consistent.

**Alternatives considered**:

- CSS-only theme switching: rejected because Chart.js colors/options are canvas-rendered and need explicit theme data.
- Per-chart theme overrides: rejected because it creates visual drift and multiplies maintenance.

### D-005: Keep the toast EventTarget bus and stable operation keys

**Decision**: Use the existing bus for non-blocking progress/results. Replace by stable key, preserve explicit dismissal/expiry, and expose appropriate live semantics without rendering unsafe diagnostic data by default.

**Rationale**: `Main` already publishes progress and terminal states through this bus, and `ToastHost` already isolates timer-driven re-renders from `Main`.

**Alternatives considered**:

- Add a global notification state library: rejected because it is unnecessary for the existing event volume and adds a dependency.
- Persist notifications: rejected because the feature requires transient operation feedback, not notification history.

### D-006: No new dependency or server contract

**Decision**: Use existing React, React Router, Chart.js, Bootstrap, Playwright, browser APIs, and current WebSocket message shapes.

**Rationale**: The required behavior is already represented in the client code; dependency or protocol changes would increase regression risk and violate the feature boundary.

## Risks and Mitigations

- **Route/rotation race**: add a focused test that advances rotation and asserts the URL and visible chart agree; clean the interval on disable/unmount.
- **Date utility blast radius**: preserve the existing function signature and add tests for daily, unsupported, malformed, and empty ranges before changing implementation.
- **Automatic theme scheduling**: keep geolocation optional, bound fallback timers, and test that cleanup occurs when switching to manual mode/unmounting.
- **Toast timer races**: use stable IDs/keys, functional state updates, and test replacement plus dismissal/expiry after repeated events.
- **Chart canvas contrast**: verify shared chart options update with `darkMode` and do not rely solely on CSS colors.
- **Accessibility regressions in a dense toolbar**: add accessible names, focus-visible styles, live-region behavior, and narrow viewport browser checks.
