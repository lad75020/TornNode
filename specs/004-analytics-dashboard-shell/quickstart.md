# Quickstart: Analytics Dashboard Shell

## Prerequisites

- macOS development environment with Node.js available.
- Repository checkout at `/Volumes/WDBlack4TB/Code/tornnode`.
- Dependencies installed (`node_modules/` is present in the working checkout).
- A browser session or Playwright fixture that can exercise the existing authenticated shell boundary. Tests may stub `/session` and chart data as described by the existing client fixtures.

## Validation sequence

Run from the repository root:

```bash
npm run build
```

Expected result: Vite completes successfully and the existing static-copy step completes without errors.

Run the focused browser checks:

```bash
EXPO_SKIP_SERVER=1 AUTH_TEST_BASE_URL=http://127.0.0.1:5173 \
  npx playwright test \
  client/tests/analytics-dashboard-shell.spec.ts \
  client/tests/analytics-date-filter.spec.ts \
  client/tests/theme-cycle.spec.ts \
  client/tests/toast-notifications.spec.ts \
  client/tests/app-smoke.spec.ts \
  --config client/playwright.config.js
```

Expected results:

- The shell renders a loading or ready state, and chart navigation keeps the URL and visible view aligned.
- Date filtering accepts an inclusive daily range, rejects a reversed/future range, and displays a safe empty result.
- Theme cycling covers manual light, manual dark, automatic fallback, and persistence when storage is available.
- Progress notifications replace by operation key, terminal notifications are visible, dismissal/expiry removes them, and the shell stays interactive.
- Keyboard and narrow-viewport checks keep the core controls reachable.

Observed on 2026-08-17: the focused suite passed with 18 tests.

The repository authentication regression suite also passed:

```bash
npm run test:auth
```

Observed on 2026-08-17: 22 tests passed with 0 failures.

## Utility and lifecycle checks

The implementation should also be validated with focused browser scenarios or the existing test harness for:

1. `filterDatasetsByDate` with daily labels, empty ranges, no dates, unsupported labels, and misaligned datasets.
2. `useChartSlider` with zero/one/many available views, autoplay enable/disable, route advancement, and unmount cleanup.
3. `ThemeProvider` with unavailable geolocation, storage read/write failures, mode cycling, and automatic timer cleanup.
4. `toastBus` and `ToastHost` with keyed replacement, unkeyed events, TTL expiry, persistent dismissal, and unmount unsubscribe.

## Scope verification

After implementation:

```bash
git diff --check
git status --short
git diff --stat
```

Expected result: only the analytics-shell source/test files and `specs/004-analytics-dashboard-shell/` artifacts are changed; no server, authentication, Torn synchronization, or database-schema files are modified.

## Codebase-memory refresh

After build/tests pass, refresh the existing graph once and verify readiness:

```text
mcp__codebase_memory_mcp__index_repository(
  repo_path="/Volumes/WDBlack4TB/Code/tornnode",
  mode="moderate"
)
mcp__codebase_memory_mcp__index_status(
  project="Volumes-WDBlack4TB-Code-tornnode"
)
```

Expected result: the project status is `ready`, and targeted symbols in the changed files are discoverable.
