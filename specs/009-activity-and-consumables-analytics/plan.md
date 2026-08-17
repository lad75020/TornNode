# Implementation Plan: Activity and Consumables Analytics

**Branch**: `feature/time-machine-activity-and-consumables-analytics` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

## Summary

Harden the existing activity/consumable analytics charts and historical stats migration without changing dashboard props, route names, source log identifiers, chart library, storage technology, or CLI flags. Reuse `dbLayer.js` and the shared UTC/finite-value helpers from `financeAnalytics.js`; retain complete normalized source rows so date-only changes are local and reversible; expose safe loading, empty, and error states; and remove full JSON browser logging.

## Technical context

- Node.js CommonJS migration utility; React 19/Vite frontend.
- Fastify 5 application, authenticated dashboard, `LogsDB` IndexedDB, MongoDB, `idb`, Chart.js 4.
- Existing Node `node:test` harness plus `npm run build:static`; no browser component-test runner.
- No new dependencies.

## Architecture and Node.js decisions

- Keep asynchronous database access behind `client/src/dbLayer.js`; use `getLogsByLogId`, `getLogsByMultipleIds`, or `getAllLogsFromStore` instead of ad-hoc synchronous/raw IndexedDB callbacks where possible.
- Normalize finite Unix-second timestamps and numeric fields at the read boundary. Use shared UTC day/week/month helpers and inclusive range filtering.
- Keep complete normalized source rows in state; derive display buckets from source rows and current controls to prevent range expansion from losing data.
- Use effect cancellation guards, stable dependency lists, and generic user-visible errors. Do not render `Error` objects or raw database messages.
- Preserve `useBarBucketModal` behavior while surfacing its error state and making payload construction safe.
- Keep the migration CLI’s CommonJS/yargs interface, apply `find(query)`, use explicit URI fallback, skip malformed documents, and close MongoDB in `finally`.

## Work packages

1. **Specify and baseline**: finish feature artifacts, source-data contract, and focused tests before implementation.
2. **Revive and Xanax**: refactor `LogsGraph`, `XanaxBarGraph`, and `XanaxReceivedChart` to share validation, UTC aggregation, cancellation, and safe states.
3. **Blood and medical activity**: refactor `BloodCountGraph` and `BloodAidDailyChart`; preserve direction/title semantics and remove locale-dependent keys.
4. **Items, travel, and preview**: harden `ItemsGainedGraph`, `TravelDurationGraph`, `useBarBucketModal`, `JsonPreview`, and `jsonview.js` while preserving modal and truncation behavior.
5. **Migration utility**: harden `computeStatsFromOldStats.js` query, URI fallback, malformed-document handling, finite derived values, counters, and cleanup.
6. **Verification**: run focused/regression tests, static build, diff/source review, native codebase-memory index/status/search, then update queue state and commit without pushing.

## File map

```text
client/src/
├── LogsGraph.jsx
├── XanaxBarGraph.jsx
├── XanaxReceivedChart.jsx
├── BloodCountGraph.jsx
├── BloodAidDailyChart.jsx
├── ItemsGainedGraph.jsx
├── TravelDurationGraph.jsx
├── JsonPreview.jsx
├── jsonview.js
├── financeAnalytics.js
└── hooks/useBarBucketModal.js
utils/
└── computeStatsFromOldStats.js
tests/
└── activity-and-consumables-analytics.test.cjs
```

## Verification gates

The focused test suite must pass before the feature can enter `done`. Also required: migration syntax check, synchronization/auth/bazaar regressions, production static build, `git diff --check`, source review for raw logging/synchronous I/O/stale effects, native codebase-memory `ready` status, and final branch/queue inspection. No push is performed by this run.
