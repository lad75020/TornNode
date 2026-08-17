# Quickstart: Combat and Progression Analytics

## Prerequisites

- Node.js and installed dependencies from the repository.
- A clean authenticated test environment if running WebSocket integration tests.
- No new environment variables are required.

## Focused verification

From `/Volumes/WDBlack4TB/Code/tornnode`:

```bash
node --test tests/combat-progression-analytics.test.cjs
npm run build:static
git diff --check
```

The focused test file uses the existing in-memory Mongo/socket harness and does not call Torn’s live API. The static build verifies the React/Chart.js modules and Vite output.

## Regression verification

```bash
node --test tests/torn-data-synchronization.test.cjs
npm run test:auth
npm run test:bazaar
```

If local MongoDB/Redis services are not available, report that limitation and still run the deterministic handler tests and static build.

## Manual browser smoke check

1. Start the existing development server using the repository’s normal authenticated configuration.
2. Sign in and open the dashboard chart routes for Attacks Stats, Battle Stats, Work Stats, Racing Position, Racing Skill, and Crime Skills.
3. Confirm cached data appears when present, empty/missing stores do not leave a permanent loader, and the chart visibility toggle remains usable.
4. Change `dateFrom` and `dateTo`; verify points outside the inclusive range disappear without a new duplicate WebSocket request.
5. Reload after a live response and verify cache keys remain unique.
6. Exercise a disconnected or expired session and verify the UI shows a safe unavailable/error state without credentials or raw server exceptions.

## Codebase-memory verification

After implementation, refresh the existing codebase-memory index for the repository and confirm the project remains `ready`. Use the native `codebase-memory-mcp` tools; do not use a legacy `mcporter` fallback. Verify that the targeted chart and handler symbols remain discoverable and that no unexpected generated files are indexed.
